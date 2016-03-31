#!/bin/bash

VERSION="node_4.x"
# ubuntu nickname e.g. trusty
DISTRO=$(lsb_release -c -s)

curl -s https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add -
echo "deb https://deb.nodesource.com/${VERSION} ${DISTRO} main" > /etc/apt/sources.list.d/nodesource.list
echo "deb-src https://deb.nodesource.com/${VERSION} ${DISTRO} main" >> /etc/apt/sources.list.d/nodesource.list

aptitude update
aptitude install -y nodejs npm

npm install -g pm2

