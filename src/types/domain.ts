export type LeadStatus="Nuevo"|"Contactado"|"Reunión"|"Propuesta"|"Cliente";
export type LeadCategory="delft"|"Llegada"|"Mentoría"|"General"|"LATAM"|"ESPECIAL";
export type CrmStage="Por contactar"|"Contactado"|"Propuesta enviada"|"Llamada programada"|"Llamada tenida"|"En espera"|"Cliente"|"Lost";
export interface Contact{id:string;name:string;initials:string;email:string;phone:string;country:string;university:string;course:string;product:"Aplicación"|"The Robin Plan";status:LeadStatus;source:string;campaign:string;owner:string;probability:number;nextAction:string;lastContact:string;value:number;tags:string[];duplicate?:boolean;category?:LeadCategory;heat?:number;notes?:string;stage?:CrmStage;lostAt?:string;portalUserId?:string;createdAt?:string;clientAt?:string}
export interface ActivityItem{id:string;contactId:string;type:"mensaje"|"pago"|"documento"|"reunión"|"nota";title:string;detail:string;time:string}
