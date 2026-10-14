import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"
import * as vocabulary from "../config/music-tags.mjs"

async function load(path, dependencies = {}) {
  const compiled = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const compiledModule = { exports: {} }
  new Function("require", "module", "exports", compiled)(name => {
    assert.ok(name in dependencies, name); return dependencies[name]
  }, compiledModule, compiledModule.exports)
  return compiledModule.exports
}
class NextResponse extends Response {
  static json(data, options) { return new NextResponse(JSON.stringify(data), options) }
}
const tags = await load("../libs/songTags.ts", { "../config/music-tags.mjs": vocabulary })
test("non-administrators cannot create songs or change tags, before storage/catalog writes", async () => {
  let touches = 0
  const deniedDatabase = { from: () => { touches++; throw Error("Unexpected catalog access") } }
  const common = { "next/server":{NextResponse}, "@/libs/songTags":tags, "@/libs/getOwnerIds":{isOwnerId:()=>false},
    "@/libs/helpers":{getSafeStoragePath:()=>"unused"} }
  const create = await load("../app/api/songs/route.ts", {...common, uniqid:()=>"unused",
    "@/libs/supabaseAdmin":{supabaseAdmin:deniedDatabase}, "../backup/requireUser":{requireUser:async()=>({userId:"listener",email:"listener@example.invalid"})} })
  assert.equal((await create.POST(new Request("https://music.jokik.fi/api/songs",{method:"POST"}))).status,403)
  const edit = await load("../app/api/songs/[id]/route.ts", {...common, "@/libs/commerceAdmin":{commerceAdmin:deniedDatabase},
    "@/libs/commerceHttp":{requireCommerceUser:async()=>({id:"listener"}),commerceError:()=>NextResponse.json({error:"Invalid"},{status:400})},
    "@/libs/supabaseServer":{createRouteHandlerClient:()=>{}}, "@/libs/playlistAccess":{getSongAccess:()=>{}} })
  const response=await edit.PATCH(new Request("https://music.jokik.fi/api/songs/7",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"Song",author:"Artist",tags:["happy"]})}),{params:Promise.resolve({id:"7"})})
  assert.equal(response.status,403)
  assert.equal(touches,0)
})
test("administrator edits normalize and clear tags; invalid tags never write", async () => {
  const writes=[]
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{user_id:"administrator",image_path:null},error:null}),
    update:values=>({eq:async()=>{writes.push(values);return {error:null}}})}
  const edit=await load("../app/api/songs/[id]/route.ts", {
    "next/server":{NextResponse},"@/libs/songTags":tags,"@/libs/getOwnerIds":{isOwnerId:id=>id==="administrator"},
    "@/libs/helpers":{getSafeStoragePath:()=>"unused"},"@/libs/commerceAdmin":{commerceAdmin:{from:()=>query}},
    "@/libs/commerceHttp":{requireCommerceUser:async()=>({id:"administrator"}),commerceError:()=>NextResponse.json({error:"Invalid"},{status:400})},
    "@/libs/supabaseServer":{createRouteHandlerClient:()=>{}},"@/libs/playlistAccess":{getSongAccess:()=>{}} })
  const request=tags=>new Request("https://music.jokik.fi/api/songs/7",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"Song",author:"Artist",tags})})
  const params={params:Promise.resolve({id:"7"})}
  assert.equal((await edit.PATCH(request([" HAPPY ","happy","slow"]),params)).status,200)
  assert.deepEqual(writes[0].tags,["happy","slow"])
  assert.equal((await edit.PATCH(request([]),params)).status,200)
  assert.deepEqual(writes[1].tags,[])
  assert.equal((await edit.PATCH(request(["<script>"]),params)).status,400)
  assert.equal(writes.length,2)
})
