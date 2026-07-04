# Dockerfile for Development

# Use the official Node.js 22 Alpine image as a base.
# Alpine is chosen for its small size.
FROM node:24-alpine

# Set the working directory in the container to /app.
# All subsequent commands will be run from this directory.
WORKDIR /app

# Copy package.json and package-lock.json to the working directory.
# This is done as a separate step to leverage Docker's layer caching.
# The layer will only be invalidated if these files change.
COPY package*.json ./

# Install all dependencies, including development dependencies.
# These are needed for development tasks like running tests and hot-reloading.
RUN npm install

# Copy the rest of the application's source code into the container.
# This includes the source code, configuration files, etc.
COPY . .

# Expose port 3000 to allow external access to the application.
# This is the default port for the NestJS application.
EXPOSE 3000

# The command to run when the container starts.
# `npm run start:dev` will start the application with hot-reloading enabled.
# This means that when you change a file, the application will automatically restart.
CMD ["npm", "run", "start:dev"]