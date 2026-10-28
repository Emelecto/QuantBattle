"use client";
import {useSyncExternalStore} from "react";
import {cn} from "@/lib/cn";
const subscribeClock = (changed: () => void) => { const timer = setInterval(changed, 60000); return () => clearInterval(timer); };
const clockSnapshot = () => Math.floor(Date.now() / 60000) * 60000;
const serverClock = () => null;

export function CountdownTimer({deadline,className}:{deadline:string;className?:string}) {
 const now = useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
 const end=Date.parse(deadline);
 if(!Number.isFinite(end))return <span className="text-sm text-muted">Cierre por anunciar</span>;
 const remaining=now===null?null:Math.max(0,Math.ceil((end-now)/60000));
 const absolute=new Intl.DateTimeFormat("es-CO",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit",timeZone:"America/Bogota"}).format(new Date(end));
 return <div className={cn("text-sm text-right",className)}><p className="text-muted">{remaining===0?"Cierre de envíos":"Cierra"}</p><time dateTime={deadline} className="block text-ink">{absolute} · COL</time>{remaining!==null&&remaining>0&&<p className="mt-1 text-accent">{remaining>=1440?`${Math.floor(remaining/1440)} d ${Math.floor(remaining%1440/60)} h`:remaining>=60?`${Math.floor(remaining/60)} h ${remaining%60} min`:`${remaining} min`}</p>}</div>;
}
