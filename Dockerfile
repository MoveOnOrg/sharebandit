FROM node:alpine

COPY . /srv/app

WORKDIR /srv/app

RUN npm install && chmod +x docker.sh

ENTRYPOINT ["sh", "docker.sh"]
CMD ["index.js"]
