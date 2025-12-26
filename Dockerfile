FROM node:20-alpine

WORKDIR /app

# 패키지 파일 복사
COPY package*.json ./

# 모든 의존성 설치 (빌드를 위해 devDependencies 포함)
RUN npm ci

# 소스 코드 복사
COPY tsconfig.json ./
COPY src/ ./src/

# 빌드
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
