FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3010

# The named volume hides image node_modules on the first start.
ENTRYPOINT ["sh", "-c", "if [ ! -d node_modules/react ]; then npm install; fi && exec npm run dev -- --host 0.0.0.0 --port 3010"]
