import { validateAuthorization as validate0 } from '../run-of-show/policy'
import { validateAuthorization as validate1 } from '../studio-booking/policy'
import { validateAuthorization as validate2 } from '../rights-clearance/policy'
import { validateAuthorization as validate3 } from '../transmission-health/policy'
import { validateAuthorization as validate4 } from '../loudness-control/policy'
import { validateAuthorization as validate5 } from '../crew-call/policy'
import { validateAuthorization as validate6 } from '../render-farm/policy'
import { validateAuthorization as validate7 } from '../editorial-approval/policy'
import type { Entity, Field, Operation, Product } from '../workspace/types'
import { entity, number, requireThat, text } from '../workspace/values'
const roles=["Production Coordinator","Editorial Standards Lead","Broadcast Engineer","Executive Producer"] as const
const textField=(key:string,label:string):Field=>({key,label,type:'text',required:true,initial:'Evidence pending'})
const numberField=(key:string,label:string,initial:number):Field=>({key,label,type:'number',required:true,integer:true,min:0,max:1000000000,initial})
const dateField=(key:string,label:string):Field=>({key,label,type:'date',required:true,initial:'2026-09-14'})
type Validator=(record:{measured:number;limit:number;evidence:string;revision:number})=>unknown
function workflowOperations(kind:string,label:string,validate:Validator):Operation[]{return[
  {key:kind+'-submit',label:'Submit '+label,kind,from:['draft'],roles:[roles[0]],run:({entity})=>{entity.status='review';return label+' submitted for independent review.'}},
  {key:kind+'-authorize',label:'Authorize '+label,kind,from:['review'],roles:[roles[1]],run:({entity})=>{validate({measured:number(entity.fields,'measured'),limit:number(entity.fields,'limit'),evidence:text(entity.fields,'evidence'),revision:entity.revision});entity.status='authorized';return label+' authorized against current evidence and limits.'}},
  {key:kind+'-execute',label:'Execute '+label,kind,from:['authorized'],roles:[roles[2]],run:({entity,now})=>{requireThat(text(entity.fields,'effectiveDate')<=now.slice(0,10),'The effective date has not arrived.');entity.status='active';return label+' executed with operational custody recorded.'}},
  {key:kind+'-block',label:'Block '+label,kind,from:['authorized','active'],roles:[roles[0],roles[2]],fields:[textField('reason','Blocking reason')],run:({entity,input})=>{requireThat(text(input,'reason').trim().length>=8,'A specific blocking reason is required.');entity.status='blocked';return label+' blocked without losing prior evidence.'}},
  {key:kind+'-recover',label:'Recover '+label,kind,from:['blocked'],roles:[roles[1]],fields:[textField('recovery','Recovery evidence')],run:({entity,input})=>{requireThat(text(input,'recovery').trim().length>=8,'Recovery evidence is required.');entity.status='review';return label+' returned to review with recovery evidence.'}},
  {key:kind+'-close',label:'Close '+label,kind,from:['active'],roles:[roles[3]],run:({entity})=>{entity.status='closed';return label+' closed by accountable authority.'}},
]}
const kinds=[{
    key:"run-of-show", label:"Run-of-show sequence", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Completed rundown item",6), numberField('limit',"Required rundown item",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"studio-booking", label:"Studio capacity", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Required studio hours",4), numberField('limit',"Available studio hours",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"rights-clearance", label:"Media rights clearance", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Asset rights revision",6), numberField('limit',"Approved rights revision",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"transmission-health", label:"Transmission signal freshness", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Signal-check age (seconds)",4), numberField('limit',"Maximum signal-check age",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"loudness-control", label:"Broadcast loudness limits", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Measured loudness variance",6), numberField('limit',"Maximum loudness variance",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"crew-call", label:"Crew call window", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Crew arrival minute",4), numberField('limit',"Latest crew arrival minute",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"render-farm", label:"Render capacity reserve", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Available render units",6), numberField('limit',"Minimum render units",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"editorial-approval", label:"Editorial approval qualification", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Standards review score",4), numberField('limit',"Minimum standards score",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  }]
const operations:Operation[]=[...workflowOperations("run-of-show", "Run-of-show sequence", validate0),
...workflowOperations("studio-booking", "Studio capacity", validate1),
...workflowOperations("rights-clearance", "Media rights clearance", validate2),
...workflowOperations("transmission-health", "Transmission signal freshness", validate3),
...workflowOperations("loudness-control", "Broadcast loudness limits", validate4),
...workflowOperations("crew-call", "Crew call window", validate5),
...workflowOperations("render-farm", "Render capacity reserve", validate6),
...workflowOperations("editorial-approval", "Editorial approval qualification", validate7)]
const seed:Entity[]=[entity("run-of-show-001","run-of-show","Run-of-show sequence primary record",'review',{owner:"Production Coordinator",measured:8,limit:5,evidence:"EV-MEDIAGRID-001",effectiveDate:'2026-09-14'}),
entity("run-of-show-002","run-of-show","Run-of-show sequence recovery record",'blocked',{owner:"Broadcast Engineer",measured:8,limit:5,evidence:"REC-MEDIAGRID-001",effectiveDate:'2026-09-15'}),
entity("studio-booking-001","studio-booking","Studio capacity primary record",'review',{owner:"Production Coordinator",measured:4,limit:8,evidence:"EV-MEDIAGRID-002",effectiveDate:'2026-09-14'}),
entity("studio-booking-002","studio-booking","Studio capacity recovery record",'blocked',{owner:"Broadcast Engineer",measured:4,limit:8,evidence:"REC-MEDIAGRID-002",effectiveDate:'2026-09-15'}),
entity("rights-clearance-001","rights-clearance","Media rights clearance primary record",'review',{owner:"Production Coordinator",measured:5,limit:5,evidence:"EV-MEDIAGRID-003",effectiveDate:'2026-09-14'}),
entity("rights-clearance-002","rights-clearance","Media rights clearance recovery record",'blocked',{owner:"Broadcast Engineer",measured:5,limit:5,evidence:"REC-MEDIAGRID-003",effectiveDate:'2026-09-15'}),
entity("transmission-health-001","transmission-health","Transmission signal freshness primary record",'review',{owner:"Production Coordinator",measured:4,limit:8,evidence:"EV-MEDIAGRID-004",effectiveDate:'2026-09-14'}),
entity("transmission-health-002","transmission-health","Transmission signal freshness recovery record",'blocked',{owner:"Broadcast Engineer",measured:4,limit:8,evidence:"REC-MEDIAGRID-004",effectiveDate:'2026-09-15'}),
entity("loudness-control-001","loudness-control","Broadcast loudness limits primary record",'review',{owner:"Production Coordinator",measured:4,limit:8,evidence:"EV-MEDIAGRID-005",effectiveDate:'2026-09-14'}),
entity("loudness-control-002","loudness-control","Broadcast loudness limits recovery record",'blocked',{owner:"Broadcast Engineer",measured:4,limit:8,evidence:"REC-MEDIAGRID-005",effectiveDate:'2026-09-15'}),
entity("crew-call-001","crew-call","Crew call window primary record",'review',{owner:"Production Coordinator",measured:4,limit:8,evidence:"EV-MEDIAGRID-006",effectiveDate:'2026-09-14'}),
entity("crew-call-002","crew-call","Crew call window recovery record",'blocked',{owner:"Broadcast Engineer",measured:4,limit:8,evidence:"REC-MEDIAGRID-006",effectiveDate:'2026-09-15'}),
entity("render-farm-001","render-farm","Render capacity reserve primary record",'review',{owner:"Production Coordinator",measured:8,limit:5,evidence:"EV-MEDIAGRID-007",effectiveDate:'2026-09-14'}),
entity("render-farm-002","render-farm","Render capacity reserve recovery record",'blocked',{owner:"Broadcast Engineer",measured:8,limit:5,evidence:"REC-MEDIAGRID-007",effectiveDate:'2026-09-15'}),
entity("editorial-approval-001","editorial-approval","Editorial approval qualification primary record",'review',{owner:"Production Coordinator",measured:8,limit:5,evidence:"EV-MEDIAGRID-008",effectiveDate:'2026-09-14'}),
entity("editorial-approval-002","editorial-approval","Editorial approval qualification recovery record",'blocked',{owner:"Broadcast Engineer",measured:8,limit:5,evidence:"REC-MEDIAGRID-008",effectiveDate:'2026-09-15'})]
export const product:Product={name:"MediaGrid",description:"Broadcast and digital-media production operations",accent:"#A02C6F",actors:roles.map((role,index)=>({id:'actor-'+String(index),name:role,role})),kinds,operations,seed,
 validate:(entities)=>{for(const row of entities){requireThat(kinds.some(kind=>kind.key===row.kind),'Unknown domain record.');requireThat(typeof row.fields['owner']==='string','Every workflow requires accountable ownership.')}},
 metrics:(entities)=>[{label:'Domain records',value:String(entities.length)},{label:'Active controls',value:String(entities.filter(row=>['review','authorized','active','blocked'].includes(row.status)).length)},{label:'Blocked',value:String(entities.filter(row=>row.status==='blocked').length)},{label:'Closed',value:String(entities.filter(row=>row.status==='closed').length)}]}
