Парсер Росреестра для получения выписок из ЕГРН

##########################################################

Должен быть создан файл config.json в той же директории, что и скрипт rosreestr.js.
Формат файла config.json (Пример):
{
  "EGRN_URL": "https://rosreestr.gov.ru/wps/portal/p/cc_present/ir_egrn",
  "EGRN_KEY": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "ANTICAPTCHA_KEY": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "DATAFILE_NAME": "rr_data/data1.txt",
  "DONEFILE_NAME": "rr_data/done.txt",
  "DATA_REGION": "Москва",
  "LOGFILE_NAME": "rosreestr.log"
}

##########################################################

Пример файла из конфигурации DATAFILE_NAME из конфигурации:
77:06:00050xx:xxx1
77:06:00050xx:xxx2
77:06:00050xx:xxx3
77:06:00050xx:xxx4
77:06:00050xx:xxx5
77:06:00050xx:xxx6

##########################################################

После обработки объекта и заказа Выписки, первая строка из файла из конфигурации DATAFILE_NAME перемещается в конец файла из конфигурации DONEFILE_NAME.

##########################################################

Лог работы программы пишется в файл, указанный в конфигурации LOGFILE_NAME

