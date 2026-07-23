# ==========================================
# Stage 1: Build the React/Vite application
# ==========================================
# CHANGED: Upgraded to Node 22 to support your newer Vite/Tailwind dependencies
FROM node:22-alpine as build

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first (better for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your app's source code
COPY . .

# Build the app (Vite outputs to the 'dist' folder)
RUN npm run build 


# ==========================================
# Stage 2: Serve the app with Nginx
# ==========================================
FROM nginx:alpine

# Copy your custom nginx.conf into the Nginx container
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built assets from Stage 1 into Nginx's web directory.
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 8080 for Cloud Run
EXPOSE 8080

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
