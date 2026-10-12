const jwt=require('jsonwebtoken');
const pool=require('../config/database');
async function auth(req,res,next){
  try{
    const h=req.headers.authorization||'';
    const token=h.startsWith('Bearer ')?h.slice(7):null;
    if(!token)return res.status(401).json({message:'Authentication required.'});
    const payload=jwt.verify(token,process.env.JWT_SECRET);
    const [rows]=await pool.query('SELECT id,name,email,role FROM users WHERE id=?',[payload.id]);
    if(!rows.length)return res.status(401).json({message:'User not found.'});
    req.user=rows[0];next();
  }catch(e){return res.status(401).json({message:'Invalid or expired token.'})}
}
function role(...roles){return (req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({message:'Access denied.'})}
module.exports={auth,role};