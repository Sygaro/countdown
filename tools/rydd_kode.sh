npx prettier --write "static/**/*.{html,css,js}"
sleep 1
black app static
sleep 1
ruff check app --fix

