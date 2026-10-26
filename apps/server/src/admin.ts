import argon2 from 'argon2';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { pool,query,one } from './db.js';
import { migrate } from './migrate.js';
import { key } from './security.js';
if(process.argv.includes('--key')){console.log(randomBytes(32).toString('hex'));process.exit(0);}
key(); await migrate();
const rl=createInterface({input:process.stdin,output:process.stdout});
const username=await rl.question('Nome de usuário: ');
console.log('A senha será lida da variável CELL_ADMIN_PASSWORD; não passe senha como argumento.');
const password=process.env.CELL_ADMIN_PASSWORD;
if(!username.trim()||!password||password.length<12)throw new Error('Defina CELL_ADMIN_PASSWORD com pelo menos 12 caracteres.');
if(await one('SELECT id FROM users LIMIT 1')){if(!process.argv.includes('--reset'))throw new Error('Conta já existe. Use --reset para trocar a senha.');await query('UPDATE users SET username=$1,password_hash=$2',[username.trim(),await argon2.hash(password)]);await query('DELETE FROM sessions');}
else await query('INSERT INTO users(username,password_hash) VALUES($1,$2)',[username.trim(),await argon2.hash(password)]);
console.log('Conta configurada.');rl.close();await pool.end();
