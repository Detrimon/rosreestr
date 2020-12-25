const {
  Builder,
  By,
  Key,
  until
} = require('selenium-webdriver');
const fs = require("fs");
var format = require('date-format');
let driver;

const Anticaptcha = require('anticaptcha2');
const ImageToTextTask = Anticaptcha.ImageToTextTask;

const sConfig = 'config.json';
let oConfig = getConfig();

const ANTICAPTCHA_KEY = oConfig.ANTICAPTCHA_KEY;
const EGRN_KEY = oConfig.EGRN_KEY;
const EGRN_URL = oConfig.EGRN_URL;
const DATAFILE_NAME = oConfig.DATAFILE_NAME;
const DONEFILE_NAME = oConfig.DONEFILE_NAME;
const DATA_REGION = oConfig.DATA_REGION;
const LOGFILE_NAME = oConfig.LOGFILE_NAME;

let anticaptcha = new Anticaptcha(ANTICAPTCHA_KEY);

// Элементы интерфейса
const SELECTOR_UNIQUE_EGRN_KEY = 'input.v-textfield'; // Поле для ввода ключа. Всталяем в перую ячейку. В остальные копируются средствами портала ЕГРН
const SELECTOR_LINK_FIND_PROPERTY_OBJECTS = '.v-button-caption'; // Ссылка "Поиск объектов недвижимости"
const SELECTOR_INPUT_CADASTRAL_NUMBER = '.v-textfield-prompt'; // Поле для ввода кадастрового номера
const SELECTOR_INPUT_REGION = '.v-filterselect-input'; // Поле для ввода регимона
const SELECTOR_CHOOSE_REGION = '.gwt-MenuItem'; // Выбор первой строки региона - Москва
const SELECTOR_BTN_FIND_OBJ = '.borderTop>div>div>div>div>div>div>div>.v-button'; // Кнопка Найти. Поиск объекта по кадастровому номеру и региону
const SELECTOR_TABL_CADASTRAL_NUM = '.v-table-table'; // Таблица и по сути дела ячейка таблицы для выбора кадастрового номера
const SELECTOR_IMG_CAPTCHA = 'div.v-verticallayout>div>div>div>div.v-embedded-image>img'; // Картинка Капчи
const SELECTOR_INPUT_CAPTCHA = 'input.v-textfield'; // Поле для ввода Капчи
const SELECTOR_BTN_SEND_REQUEST = '.v-horizontallayout>div>div>div>.v-button'; // Кнопка отправки запроса на выписку из ЕГРН
const SELECTOR_BTN_FINISH = '.v-window-contents .v-button'; // Кнопка для завершения цикла запроса на выписку из ЕГРН
const SELECTOR_POPUP_INTERVAL_FOR_REQUEST = '.popupContent .v-label'; // Окно с интервалом запроса

const WAIT_ELEM_LOAD_TIMEOUT = 10000;

let lastFinishedRequestDate;

startProcess();

async function startProcess(timeout = 0) {
  try {
    let data = fs.readFileSync(DATAFILE_NAME, 'utf-8');
    let aCadastrNumbers = data.split(/\r?\n/);

    if (!driver) driver = await new Builder().forBrowser('firefox').build();
    if (timeout) {
      doLog(`${format('dd.MM.yyyy hh:mm:ss', new Date())} : Ожидаем ${timeout/1000} секунд(ы)`);
      doLog(`>>>> Следующий запуск в ${format('dd.MM.yyyy hh:mm:ss', new Date((new Date()).getTime() + timeout))}`);
      await driver.sleep(timeout);
      timeout = 0;
    }
    await connectEGRN(driver);

    for (let sCadastrNumber of aCadastrNumbers) {
      doLog(`${format('dd.MM.yyyy hh:mm:ss', new Date())} : Start : ${sCadastrNumber} >>> Осталось: ${aCadastrNumbers.length - aCadastrNumbers.indexOf(sCadastrNumber)}`);
      await findPropertyObjects(driver, sCadastrNumber); // Нажимаем ссылку "Поиск объектов недвижимости"
      await inputCadastralNumber(driver, sCadastrNumber); // Вводим кадастровый номер
      await inputRegion(driver); // Вводим регион в поле Регион и щелкаем по всплывающему окну для выбора Региона
      await pressBtnSearch(driver); // Нажимаем кнопку поиск
      await chooseCadastralNumber(driver); // Выбираем кадастровый номер из таблицы
      let sUrl = await waitCaptchaLoad(driver); // Ожидаем загрузку капчи и получаем из src ссылку на капчу
      await startBrowserScript(driver, sUrl); // В браузере запускаем скрипт, чтобы получить картинку капчи и результат кладем в <body data-mtt='..'>
      let sCaptchaResult = await resolveCaptcha(driver); // Решаем капчу
      if (!sCaptchaResult || sCaptchaResult.length !== 5) {
        doLog(`${format('dd.MM.yyyy hh:mm:ss', new Date())} : "${sCaptchaResult}" : не валидна. Повторная отправка капчи на проверку`);
        await resolveCaptcha(driver); // Если в ответе пусто или капча не равна 5 символам, то попробуем еще один раз..
      }
      await inputCaptchaResult(driver, sCaptchaResult); // Вводим решенную капчу в поле капчи
      await sendRequest(driver); // Отправляем запрос на Выписку
      await pressFinishBtn(driver, sCadastrNumber) // Завершаем обработку цикла. Нажимаем кнопку завершения.
      
      await driver.sleep(rndTimeoutMs(280000, 285000)); // Таймаут в 5+ минут для ЕГРН
    };
    await driver.quit();
  } catch (e) {
    console.error(e);
    let neededTimeout = 0;
    if (lastFinishedRequestDate) {
      neededTimeout = 305000 - ((new Date()).getTime() - lastFinishedRequestDate);
    }
    await driver.manage().deleteAllCookies();
    startProcess(neededTimeout);
  }

}

function rndTimeoutMs(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function connectEGRN(driver) {
  try {
    // Открываем сайт Росреестра
    await driver.get(EGRN_URL);
    // Вводим уникальный ключ ЕГРН и нажимает Enter (Отдельно кнопку не нажимаем)
    await driver.wait(driver.findElements(By.css(SELECTOR_UNIQUE_EGRN_KEY)), WAIT_ELEM_LOAD_TIMEOUT);
    await driver.sleep(rndTimeoutMs(700, 1200));
    await driver.findElement(By.css(SELECTOR_UNIQUE_EGRN_KEY)).sendKeys(EGRN_KEY, Key.RETURN);
    await driver.sleep(rndTimeoutMs(700, 1200));
  } catch (e) {
    console.error(e);
    throw(e);
  }
}

async function findPropertyObjects(driver, sCadastrNumber) {
  try {
    // Ждем загрузки страницы и нажимаем на ссылку "Поиск объектов недвижимости"
    await driver.wait(driver.findElements(By.css(SELECTOR_LINK_FIND_PROPERTY_OBJECTS)), WAIT_ELEM_LOAD_TIMEOUT);
    await driver.sleep(rndTimeoutMs(3500, 4000));
    await (await driver.findElement(By.css(SELECTOR_LINK_FIND_PROPERTY_OBJECTS))).click();
    return true;
  } catch (e) {
    console.error(e);
    throw(e);
  }
}

async function inputCadastralNumber(driver, sCadastrNumber) {
  try {
    // Ждем загрузку элементов и Вводим значение кадастрового номера и нажимаем Enter
    await driver.wait(driver.findElements(By.css(SELECTOR_INPUT_CADASTRAL_NUMBER)), WAIT_ELEM_LOAD_TIMEOUT);
    await driver.sleep(rndTimeoutMs(3500, 4000));
    await driver.findElement(By.css(SELECTOR_INPUT_CADASTRAL_NUMBER)).sendKeys(sCadastrNumber, Key.RETURN);
    return true;
  } catch (e) {
    console.error(e)
    throw(e);
  }
}

async function inputRegion(driver) {
  try {
    // Вводим значения в поле Регион и нажимаем Enter
    await driver.sleep(rndTimeoutMs(700, 1200));
    await driver.findElement(By.css(SELECTOR_INPUT_REGION)).sendKeys(DATA_REGION);
    await driver.sleep(rndTimeoutMs(1800, 2600));
    await driver.wait(driver.findElements(By.css(SELECTOR_CHOOSE_REGION)), WAIT_ELEM_LOAD_TIMEOUT);
    await driver.sleep(rndTimeoutMs(700, 1200));
    await (await driver.findElement(By.css(SELECTOR_CHOOSE_REGION))).click();
    return true;
  } catch (e) {
    console.error(e)
    throw(e);
  }
}

async function pressBtnSearch(driver) {
  try {
    // Нажимаем кнопку "Найти"
    await (await driver.findElement(By.css(SELECTOR_BTN_FIND_OBJ))).click();
    return true;
  } catch (e) {
    console.error(e)
    throw(e);
  }
}

async function chooseCadastralNumber(driver) {
  try {
    // Ждем загрузки следующего элемента и выбираем кадастровую запись из списка

    await driver.wait(driver.findElements(By.css(SELECTOR_TABL_CADASTRAL_NUM)), WAIT_ELEM_LOAD_TIMEOUT);
    await driver.sleep(rndTimeoutMs(3500, 4000));
    await (await driver.findElement(By.css(SELECTOR_TABL_CADASTRAL_NUM))).click();
    return true;
  } catch (e) {
    console.error(e)
    throw(e);
  }
}

async function waitCaptchaLoad(driver) {
  try {
    // Ждем загрузки Капчи и забираем ссылку картинку с капчей
    await driver.wait(driver.findElements(By.css(SELECTOR_IMG_CAPTCHA)), WAIT_ELEM_LOAD_TIMEOUT);
    await driver.sleep(rndTimeoutMs(4000, 4500));
    let url = await driver.findElement(By.css(SELECTOR_IMG_CAPTCHA)).getAttribute('src');
    await driver.sleep(rndTimeoutMs(600, 1200));

    return url;
  } catch (e) {
    console.error(e)
    throw(e);
  }
}

async function startBrowserScript(driver, sUrl) {
  try {
    // В браузере запускаем скрипт, который формирует картинку для отправки на сервис разгадывания КАПЧ
    // Полученную картинку помещаем в атрибуте data-mtt тега <body>
    let browserScript = "function toDataURL(url, callback) {var xhr = new XMLHttpRequest();xhr.onload = function() {var reader = new FileReader();reader.onloadend = function() {callback(reader.result);};reader.readAsDataURL(xhr.response);};xhr.open('GET', url);xhr.responseType = 'blob';xhr.send();};toDataURL('" + sUrl + "', function(dataUrl) { document.body.dataset.mtt = dataUrl; })";
    await driver.executeScript(browserScript);
    return true;
  } catch (e) {
    console.error(e)
    throw(e);
  }
}

async function resolveCaptcha(driver) {
  try {
    // Подождем немного, чтобы наверняка.. И считаем атрибут data-mtt из тега <BODY>
    await driver.sleep(rndTimeoutMs(3500, 4500));
    let captcha = await driver.findElement(By.css('body')).getAttribute('data-mtt');

    // Из строки картинки убираем начало, так как оно не нужно.
    captcha = captcha.replace('data:application/octet-stream;base64,', '');

    // Создем Anticaptcha TASK. в body передаем нашу карнитку и указываем, что в ней только цифры (number: 1)
    let taskId = await anticaptcha.createTask(new ImageToTextTask({
      body: captcha,
      numeric: 1,
    }));

    // Результат проверки капчи получаем в переменную result
    let result = await anticaptcha.getTaskResult(taskId, {
      wait: true,
      waitTime: [2000, 1000]
    }).then(function (res) {
      return res.text;
    });

    return result;
  } catch (e) {
    console.error(e)
    startProcess();
    throw(e);
  }
}

async function inputCaptchaResult(driver, sCaptchaResult) {
  try {
    await driver.sleep(rndTimeoutMs(700, 1300));

    // Вводим полученное значение капчи в поле капчи;
    await driver.findElement(By.css(SELECTOR_INPUT_CAPTCHA)).sendKeys(sCaptchaResult, Key.RETURN);
    await driver.sleep(rndTimeoutMs(1000, 1500));
    return true;
  } catch (e) {
    console.error(e)
    throw(e);
  }
}

async function sendRequest(driver) {
  try {
    // Нажимаем кнопку "Отпрвить запрос"

    await (await driver.findElement(By.css(SELECTOR_BTN_SEND_REQUEST))).click();

    await driver.sleep(rndTimeoutMs(3000, 4000));

    await checkIntervalMessage(driver);

    removeFirstLineFromFile();
    return true;
  } catch (e) {
    if (e === 'Превышен интервал между запросами, сделать рестарт...') {
      throw(e);
    }
  }
}

async function pressFinishBtn(driver, sCadastrNumber) {
  try {
    // Ожидаем загрузки следующего элемента (окно подтерждения) и на кликаем на кнопке подтверждения
    let reqId = await driver.wait(until.elementLocated(By.css('.v-label.v-label-tipFont.tipFont.v-label-undef-w b')), WAIT_ELEM_LOAD_TIMEOUT).getText()

    lastFinishedRequestDate = new Date();
    doLog(`${format('dd.MM.yyyy hh:mm:ss', lastFinishedRequestDate)} : Запрос ${reqId} на ${sCadastrNumber} отправлен`);

    await driver.wait(driver.findElements(By.css(SELECTOR_BTN_FINISH)), WAIT_ELEM_LOAD_TIMEOUT);
    await driver.sleep(rndTimeoutMs(2000, 2500));
    await (await driver.findElement(By.css(SELECTOR_BTN_FINISH))).click();
    await driver.sleep(rndTimeoutMs(2000, 2500));
    return true;
  } catch (e) {
    console.error(e)
    throw(e);
  }
}

async function checkIntervalMessage(driver) {
  let textMessage;
  try {
    textMessage = await driver.findElement(By.css(SELECTOR_POPUP_INTERVAL_FOR_REQUEST)).getText();
  } catch(e) {

  } finally {
    if (textMessage === 'Превышен интервал между запросами') {
      throw "Превышен интервал между запросами, сделать рестарт...";
    }
  }
}

function removeFirstLineFromFile() {
  fs.readFile(DATAFILE_NAME, (err, data) => {
    if (err) {
      throw err;
    }
    let fileRows = data.toString().split(/\r?\n/);
    let firstRow = fileRows.shift();

    const fileData = new Uint8Array(Buffer.from(fileRows.join('\n')));

    fs.writeFile(DATAFILE_NAME, fileData, (err) => {
      if (err) {
        throw err;
      }
    });
    fs.appendFile(DONEFILE_NAME, '\n' + firstRow, function (err) {
      if (err) {
        // append failed
      } else {
        // done
      }
    })

  });
}

function getConfig() {
  let sFileData = fs.readFileSync(sConfig, 'utf-8');
  let oConfig = JSON.parse(sFileData.toString());
  return oConfig;
}

function doLog(msg) {
  console.log(msg);

  fs.appendFile(LOGFILE_NAME, msg + '\n', function (err) {
    if (err) {
      console.error('Не удалось записать в файл лога: ', err);
    }
  })

}