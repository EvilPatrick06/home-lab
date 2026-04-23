#!/bin/bash
# Fix userconf for first boot
HASH=$(grep "^patrick:" /etc/shadow | cut -d: -f2)
echo "patrick:$HASH" > /mnt/ssd-boot/userconf
echo "userconf written: $(wc -c < /mnt/ssd-boot/userconf) bytes"

# Copy setup script to SSD
cp /home/patrick/home-lab/bmo/setup-bmo.sh /mnt/ssd-root/tmp/setup-bmo.sh
chmod +x /mnt/ssd-root/tmp/setup-bmo.sh

# Create a first-boot script that moves configs into place
cat > /mnt/ssd-root/tmp/first-boot.sh << 'FBEOF'
#!/bin/bash
# Run this after first boot on the SSD
# Move backed-up configs into place
mkdir -p ~/home-lab/bmo/pi/config
mkdir -p ~/.config/rclone
cp /tmp/.env ~/home-lab/bmo/pi/.env 2>/dev/null
cp -r /tmp/config/* ~/home-lab/bmo/pi/config/ 2>/dev/null  
cp -r /tmp/rclone/* ~/.config/rclone/ 2>/dev/null
echo "Configs restored"
FBEOF
chmod +x /mnt/ssd-root/tmp/first-boot.sh

# Unmount
umount /mnt/ssd-boot /mnt/ssd-root
echo "SSD unmounted and ready"
