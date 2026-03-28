import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN skills_json TEXT
  `;

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN knowledge_sources_json TEXT
  `;

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN mcp_servers_json TEXT
  `;

  yield* sql`
    UPDATE projection_projects
    SET
      skills_json = COALESCE(skills_json, '[]'),
      knowledge_sources_json = COALESCE(knowledge_sources_json, '[]'),
      mcp_servers_json = COALESCE(mcp_servers_json, '[]')
  `;
});
