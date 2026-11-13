# PrepMind frontend: build the Vite app, then serve it with nginx, which also
# forwards /api to the backend container.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# frontend/.env holds only public VITE_ values (e.g. the Google client ID); Vite bakes them in.
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
