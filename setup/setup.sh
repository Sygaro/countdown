#!/bin/bash
set -euo pipefail

USERNAME="reidar"
SAMBA_CONF="/etc/samba/smb.conf"
BASHRC="/home/$USERNAME/.bashrc"
# Spør etter Samba-passord tidlig
read -s -p "Velg Samba-passord for $USERNAME: " SAMBA_PASS
echo

echo "=== Sjekker bruker ==="
if id "$USERNAME" &>/dev/null; then
    echo "Brukeren $USERNAME finnes allerede"
else
    echo "Oppretter bruker $USERNAME..."
    sudo adduser --gecos "" $USERNAME
    sudo usermod -aG sudo $USERNAME
fi

echo "=== Oppdaterer systempakker ==="
sudo apt-get update
echo "=== Oppdaterer system og installerer pakker ==="
sudo DEBIAN_FRONTEND=noninteractive \
  apt-get -o Dpkg::Options::="--force-confnew" \
          -o Dpkg::Options::="--force-confold" \
          -y full-upgrade

# --force-confnew = bruk alltid den nye filen fra pakken
# --force-confold = behold alltid din eksisterende fil
# --force-confdef = bruk standardvalg automatisk der det er mulig

sudo apt-get install -y git samba htop vim curl wget tree net-tools nmap
sudo apt-get autoremove -y

echo "=== Legger til aliaser i $BASHRC ==="
ALIASES=$(cat <<'EOF'

# === Tilpassede aliaser ===
alias ll='ls -lh --color=auto'
alias la='ls -A'
alias l='ls -CF'

# Pakkehåndtering
alias update='sudo apt update && sudo apt full-upgrade -y && sudo apt autoremove -y && sudo apt clean'

# Navigasjon
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'

# Systeminfo
alias meminfo='free -m -l -t'
alias cpuinfo='lscpu'
alias diskinfo='df -hT'
alias temp='vcgencmd measure_temp'

# Nettverk
alias ports='sudo lsof -i -P -n | grep LISTEN'
alias myip='hostname -I | awk "{print \$1}"'
alias wanip='curl -s ifconfig.me'

# Hurtig reboot/shutdown
alias reboot='sudo systemctl reboot'
alias shutdown='sudo systemctl poweroff'

# Git
alias gs='git status'
alias ga='git add .'
alias gc='git commit -m'
alias gp='git push'

EOF
)

# Legg aliasene til hvis de ikke finnes fra før
if ! grep -q "Tilpassede aliaser" "$BASHRC"; then
    echo "$ALIASES" >> "$BASHRC"
    echo "Aliasene ble lagt til."
else
    echo "Aliasene finnes allerede."
fi

echo "=== Setter opp git credential helper ==="
sudo -u $USERNAME git config --global credential.helper store

echo "=== Setter opp Samba-konfigurasjon ==="
if ! grep -q "^\[home\]" "$SAMBA_CONF"; then
    sudo tee -a $SAMBA_CONF > /dev/null <<EOF
[home]
   path = /home/$USERNAME
   browseable = yes
   writeable = yes
   only guest = no
   create mask = 0775
   directory mask = 0775
   public = no
   valid users = $USERNAME
EOF
    echo "Samba-share lagt til."
else
    echo "Samba-share finnes allerede."
fi

echo "=== Legg til Samba-passord for $USERNAME ==="
# sudo smbpasswd -a $USERNAME
# echo "$SAMBA_PASS" | sudo smbpasswd -a -s $USERNAME
(echo "$SAMBA_PASS"; echo "$SAMBA_PASS") | sudo smbpasswd -a $USERNAME


echo "=== Restarter Samba ==="
sudo systemctl restart smbd

echo "=== Rydder apt-cache ==="
sudo apt autoremove -y
sudo apt clean

echo "=== Ferdig! Rebooter systemet nå ==="
sudo reboot
