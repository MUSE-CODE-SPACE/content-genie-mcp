FROM node:20-alpine

WORKDIR /app

# 패키지 파일 복사 및 설치
COPY package*.json ./
RUN npm ci --only=production

# 빌드된 파일 복사
COPY dist/ ./dist/

# 환경 변수
ENV NODE_ENV=production
ENV MCP_HTTP_MODE=true
ENV PORT=3000

EXPOSE 3000

# 서버 실행
CMD ["node", "dist/index.js"]
