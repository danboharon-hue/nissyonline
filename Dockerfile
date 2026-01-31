# Stage 1: Compile nissy from source
FROM gcc:latest AS builder
RUN git clone https://github.com/sebastianotronto/nissy-classic.git /nissy-src
WORKDIR /nissy-src
RUN cc -std=c99 -pthread -pedantic -Wall -Wextra -Wno-unused-parameter -O3 \
    -DVERSION=\"2.0.8\" -o nissy src/*.c

# Stage 2: Run the web server
FROM node:20-slim
WORKDIR /app

COPY --from=builder /nissy-src/nissy /app/nissy
RUN chmod +x /app/nissy

COPY server.js .
COPY public/ public/

ENV NISSY_PATH=/app/nissy
ENV PORT=3000

EXPOSE 3000
CMD ["node", "server.js"]
