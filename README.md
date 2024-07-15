# Dependency-Check Extension for VSCode

- Расширение разработано в рамках PT_START INT-31

## Features

- Запуск Dependency Check в отдельной вкладке WebView
- Отображение консоли для отслеживания процесса работы команды
- Отображение результата в отдельной вкладке после завершения анализа
- Отдельная вкладка WebView с глобальными/проектными настройками с возможностью изменять эти настройки здесь же
- Возможность обновления актуальной версии Dependency Check
- Возможность изменения параметров команды запуска Dependency Check в настройках
- Отслеживание изменений зависимостей проекта и запуск Dependency Check
- Проверка наличия необходимых интрументов для анализа

## Commands

* `showSettings`: Отображает глобальные/проектные настройки и кнопку обновления версии DC
* `runDC`: Открывает окно с запуском Dependency Check для анализа текущего открытого проекта
* `checkDependencies`: Проверяет наличие необходимых инструментов для анализа

![image](https://github.com/user-attachments/assets/e6787de7-2a2c-47f1-838d-eee40bfc9b3e)

## Interfaces

- Run Dependency Check (runDC)

![image](https://github.com/e1essar/dependency-check/assets/80064778/9eb2dab3-2265-4aa0-9025-8c7fadad1b8e)

![image](https://github.com/e1essar/dependency-check/assets/80064778/7a630eec-0745-49e0-8e5d-6576f50a2c0f)

![image](https://github.com/e1essar/dependency-check/assets/80064778/e00dc8a9-792b-42a9-a2bb-6e3e32dcd7aa)

- Show Settings (showSettings)

![image](https://github.com/e1essar/dependency-check/assets/80064778/2d0ec678-c7c9-45dd-b0d1-b1cdb5d57ef7)

> UPD: Обновление Dependency Check вновь работает. Может возникать ошибка при удалении текущей версии - необходимо завершить процессы Java в диспетчере задач.
>
>   ![image](https://github.com/user-attachments/assets/5e4e2acf-be02-4791-a791-c75c12b99744)

- Check Dependencies (checkDependencies)

![image](https://github.com/user-attachments/assets/3ad316aa-f4ef-48da-ae3c-41b0af6dd1ef)

> PS: Maven is not required!

## Requirements

- Установить актуальную версию Java
- Поместить папку с расширением в папку с расширениями vscode(при этом установить необходимые зависимости)

## Issues

- Отмена текущей команды Cancel Dependency Check - проблема в остановке работы текущей команды

## Release Notes

### 0.0.1

Initial release of Dependency Check Extension

### 0.0.2

- Фикс обновления Dependency Check
- Добавление команды для проверки необходимых инструментов
- Отслеживание изменений зависимостей проекта

![image](https://github.com/user-attachments/assets/3483a18b-3a51-48ef-b279-06b10aec9e77)


**Enjoy!**
