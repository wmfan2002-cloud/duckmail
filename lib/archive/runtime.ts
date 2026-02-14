import { getArchiveDatabaseUrl, getArchiveMasterKey } from "@/lib/archive/env"

let validated = false

export function assertArchiveRuntimeReady() {
  if (validated) {
    return
  }

  // 启动期强约束：数据库连接串与加密主密钥缺一不可
  getArchiveDatabaseUrl()
  getArchiveMasterKey()
  validated = true
}
