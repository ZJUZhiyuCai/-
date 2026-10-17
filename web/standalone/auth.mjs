import {randomBytes,scrypt as derive,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const secret=()=>randomBytes(32).toString('base64url');
export async function passwordHash(value){if(typeof value!=='string'||value.length<12||value.length>256)throw Error('PASSWORD_LENGTH_12_256');const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(value,salt,64)).toString('hex');}
export async function verify(value,stored){if(typeof value!=='string'||value.length>256||!stored)return false;const [salt,key]=stored.split(':');const actual=await scrypt(value,salt,64),expected=Buffer.from(key,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export function identity(req,sql){
 const authorization=req.headers.authorization;
 if(authorization){const token=authorization.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];return token?sql.prepare('SELECT owner FROM tokens WHERE hash=?').get(hash(token))?.owner:null;}
 const value=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('shuye_session='))?.slice(14);
 return value&&/^[A-Za-z0-9_-]{43}$/.test(value)?sql.prepare('SELECT owner FROM sessions WHERE hash=? AND expires>?').get(hash(value),Date.now())?.owner:null;
}
