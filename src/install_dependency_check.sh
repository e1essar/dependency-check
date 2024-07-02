#!/bin/bash

# Задаем директорию для установки
INSTALL_DIR="$HOME/dependency-check"

# Создаем директорию, если она не существует
mkdir -p $INSTALL_DIR

# Получаем последнюю версию Dependency Check
VERSION=$(curl -s https://jeremylong.github.io/DependencyCheck/current.txt)

# Скачиваем Dependency Check
curl -Ls "https://github.com/jeremylong/DependencyCheck/releases/download/v$VERSION/dependency-check-$VERSION-release.zip" --output dependency-check.zip

# Распаковываем скачанный файл в директорию установки
unzip -o dependency-check.zip -d $INSTALL_DIR

# Удаляем скачанный zip файл
rm dependency-check.zip

echo "Dependency Check установлен в $INSTALL_DIR"
