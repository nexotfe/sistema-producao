import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY ?? "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Erro: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runMigrations() {
  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.error("❌ Diretório de migrations não encontrado");
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`📋 Encontradas ${files.length} migrations`);

  let successCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf-8");

    console.log(`\n▶️  Executando: ${file}`);

    const { error } = await supabase.rpc("exec_sql", { sql });

    if (error) {
      console.error(`❌ Erro em ${file}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ ${file} executada com sucesso`);
      successCount++;
    }
  }

  console.log(`\n📊 Resultado final: ${successCount} sucesso, ${errorCount} erros`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

runMigrations().catch((err) => {
  console.error("❌ Erro ao executar migrations:", err.message);
  process.exit(1);
});
