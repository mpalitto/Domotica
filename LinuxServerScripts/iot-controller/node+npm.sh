#!/bin/bash

# 1️⃣ Install required build tools for compiling Node
sudo apt-get update
sudo apt-get install -y curl build-essential libssl-dev

# 2️⃣ Install nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 3️⃣ Load nvm into the current shell session
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Optional: enable bash completion for nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# 4️⃣ Install Node 18
nvm install 18

# 5️⃣ Set Node 18 as default
nvm alias default 18

# 6️⃣ Verify installation
echo "Node version: $(node -v)"
echo "NPM version:  $(npm -v)"

echo "✅ Node 18 + npm installed successfully in your home directory."
echo "Use 'nvm use 18' in new shells if needed."
