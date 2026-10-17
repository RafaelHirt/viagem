import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { createFileStorage } from '../server/storage'
import { sendCreationConfirmation } from '../server/notifications'
import { createApiHandler } from '../server/api'
import type { Monitor } from '../src/shared/types'
const folders:string[]=[]
afterEach(async()=>{vi.unstubAllEnvs();await Promise.all(folders.splice(0).map(folder=>rm(folder,{recursive:true,force:true})))})
const monitor:Monitor={id:'created',kind:'flight',name:'Férias em Paris',query:{origin:'GYN',destination:'Paris',arrivalAirport:'CDG',minDays:2,maxDays:2,horizonMonths:12,adults:2,allowOpenJaw:true,departureWeekdays:[5],returnWeekdays:[0]},rule:{dropPercent:30,windowDays:180},channels:{email:'qa@example.com',telegram:false},enabled:true,createdAt:'2026-10-17T17:00:00Z'}
async function storage(){const path=await mkdtemp('/tmp/viagem-receipt-');folders.push(path);return createFileStorage(path)}
describe('alert-created email receipts',()=>{
 it('confirms the saved alert independently of unconfirmed fares, with idempotence and accurate manual status',async()=>{
  vi.stubEnv('RESEND_API_KEY','test-only');vi.stubEnv('ALERT_FROM_EMAIL','noreply@example.com');vi.stubEnv('ENABLE_SCHEDULED_COLLECTION','false')
  const data=await storage(),fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({id:'accepted'})))
  expect(await sendCreationConfirmation(data,monitor,'https://partiu.example',fetcher)).toMatchObject({status:'sent'})
  expect(await sendCreationConfirmation(data,monitor,'https://partiu.example',fetcher)).toMatchObject({status:'duplicate'})
  expect(fetcher).toHaveBeenCalledOnce()
  const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body))
  expect(body.to).toEqual(['qa@example.com']);expect(body.subject).toContain('alerta criado')
  expect(body.text).toContain('2 adulto');expect(body.text).toContain('180 dias');expect(body.text).toContain('Atualização manual');expect(body.text).toContain('?alert=created')
 })
 it('keeps failures retryable and never claims a successful send without an accepted email ID',async()=>{
  vi.stubEnv('RESEND_API_KEY','test-only');vi.stubEnv('ALERT_FROM_EMAIL','noreply@example.com')
  const data=await storage(),fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('{"id":"ok"}'))
  expect((await sendCreationConfirmation(data,monitor,'https://partiu.example',fetcher)).status).toBe('failed')
  expect((await sendCreationConfirmation(data,monitor,'https://partiu.example',fetcher)).status).toBe('sent')
 })
 it('reports a missing transport without attempting to send and preserves the alert in the API',async()=>{
  vi.stubEnv('RESEND_API_KEY','');vi.stubEnv('ALERT_FROM_EMAIL','')
  const data=await storage(),fetcher=vi.fn<typeof fetch>()
  expect((await sendCreationConfirmation(data,monitor,'https://partiu.example',fetcher)).status).toBe('not-configured');expect(fetcher).not.toHaveBeenCalled()
  const handler=createApiHandler({storage:data,password:'password-test-only'})
  const login=await handler(new Request('https://partiu.example/api/session',{method:'POST',body:JSON.stringify({password:'password-test-only'})}))
  const cookie=login.headers.get('set-cookie')!.split(';')[0]
  const response=await handler(new Request('https://partiu.example/api/monitors',{method:'POST',headers:{Cookie:cookie},body:JSON.stringify(monitor)}))
  expect(response.status).toBe(201);const saved=await response.json()
  expect(saved.monitor.creationEmail.status).toBe('not-configured');expect(await data.getMonitor(saved.monitor.id)).not.toBeNull()
 })
})
