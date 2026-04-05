.PHONY: dev build start install

# Установка зависимостей фронтенда
install:
	npm install

# Запуск фронтенда в режиме разработки
dev:
	npm run dev

# Сборка фронтенда для продакшена
build:
	npm run build

# Запуск собранного продакшен-билда
start:
	npm start

# Если твой товарищ использует Docker для бэкенда, можно добавить команду "run-all"
# run-all:
#	docker-compose up -d && npm run dev