# Dependency-Check Extension for VSCode

- Расширение разработано в рамках PT_START INT-31 

## Commands

* `showSettings`: Отображает глобальные/проектные настройки и кнопку обновления версии DC
* `runDC`: Открывает окно с запуском Dependency Check для анализа текущего открытого проекта

![image](https://github.com/e1essar/dependency-check/assets/80064778/53152f11-8945-40ea-ac09-edcaf7bb0ee1)

> Tip: 

## Interfaces

- Run Dependency Check (runDC)

![image](https://github.com/e1essar/dependency-check/assets/80064778/9eb2dab3-2265-4aa0-9025-8c7fadad1b8e)

![image](https://github.com/e1essar/dependency-check/assets/80064778/7a630eec-0745-49e0-8e5d-6576f50a2c0f)

![image](https://github.com/e1essar/dependency-check/assets/80064778/e00dc8a9-792b-42a9-a2bb-6e3e32dcd7aa)

- Show Settings (showSettings)

![image](https://github.com/e1essar/dependency-check/assets/80064778/2d0ec678-c7c9-45dd-b0d1-b1cdb5d57ef7)

> PS: Обновление Dependency Check не работает по неизвестной причине (работало в предыдущих коммитах). В дальнейшем будет фикс!

## Requirements

- Установить актуальную версию Java
- Поместить папку с расширением в папку с расширениями vscode(при этом установить необходимые зависимости)

## Issues

Обновление Dependency Check - проблема в активации работы команды
Отмена текущей команды Cancel Dependency Check - проблема в остановке работы текущей команды

## Release Notes

### 0.0.1

Initial release of Dependency Check Extension

**Enjoy!**
