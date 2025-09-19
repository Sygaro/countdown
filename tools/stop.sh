systemctl --user stop countdown.service
sudo systemctl stop kiosk-cog.service

sleep 1
systemctl --user status countdown.service -n 50 --no-pager
