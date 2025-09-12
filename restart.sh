systemctl --user restart countdown.service
sudo systemctl restart kiosk-cog.service
sleep 2
systemctl --user status countdown.service -n 50 --no-pager

# systemctl --user status countdown.service
# sudo systemctl status kiosk-cog.service 
