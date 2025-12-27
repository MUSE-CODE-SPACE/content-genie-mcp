FROM node:20-alpine

WORKDIR /app

# package.json과 tsconfig.json 복사
COPY package*.json ./
COPY tsconfig.json ./

# 의존성 설치 (prepare 스크립트 무시)
RUN npm ci --ignore-scripts

# 소스 코드 복사
COPY src/ ./src/

# 빌드 실행
RUN npm run build

# 프로덕션 의존성만 남기기
RUN npm prune --production

# 환경 변수
ENV NODE_ENV=production
ENV MCP_HTTP_MODE=true
ENV PORT=3000

EXPOSE 3000

# 서버 실행
CMD ["node", "dist/index.js"]
