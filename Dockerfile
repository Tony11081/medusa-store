FROM node:18-alpine

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制源代码
COPY . .

# 构建
RUN npm run build

# 暴露端口
EXPOSE 9000

# 启动命令
CMD ["npm", "run", "start"]
