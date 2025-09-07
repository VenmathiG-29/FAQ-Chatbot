const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const ADMINS_FILE = path.join(__dirname, 'admins.json');

(async () => {
  const username = process.argv[2] || 'superadmin';
  const password = process.argv[3] || 'admin123';
  const role = process.argv[4] || 'superadmin';
  const hash = await bcrypt.hash(password, 10);
  const admin = { id: require('uuid').v4(), username, passwordHash: hash, role };
  let admins = [];
  if (fs.existsSync(ADMINS_FILE)) admins = JSON.parse(fs.readFileSync(ADMINS_FILE,'utf-8')||'[]');
  admins.push(admin);
  fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2));
  console.log('Created superadmin:', username);
})();
