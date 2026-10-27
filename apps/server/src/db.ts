import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:25});
export const db=drizzle(pool);
export async function query<T=any>(sql:string,params:unknown[]=[]):Promise<T[]> {return (await pool.query(sql,params)).rows;}
export async function one<T=any>(sql:string,params:unknown[]=[]):Promise<T|undefined>{return (await query<T>(sql,params))[0];}
export async function ensureSection(name:string){await query('INSERT INTO sections(name,position) VALUES($1,(SELECT COALESCE(max(position),0)+1 FROM sections)) ON CONFLICT(name) DO NOTHING',[name]);}
export async function event(type:string,payload:unknown){await query('INSERT INTO events(type,payload) VALUES($1,$2)',[type,JSON.stringify(payload)]);}
export async function transaction<T>(fn:(client:pg.PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
