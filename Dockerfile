FROM node:20-alpine

WORKDIR /app

# 모든 파일 복사 먼저 (prepare 스크립트 실행을 위해)
COPY package*.json tsconfig.json ./
COPY src/ ./src/

# 모든 의존성 설치 (npm ci가 prepare 스크립트 실행하여 빌드도 함께)
RUN npm ci

# 프로덕션 의존성만 남기기
RUN npm prune --production

# 환경 변수
ENV NODE_ENV=production
ENV MCP_HTTP_MODE=true
ENV PORT=3000

EXPOSE 3000

# 서버 실행
CMD ["node", "dist/index.js"]
