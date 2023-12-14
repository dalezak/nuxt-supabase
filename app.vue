<template>
  <div>
    <h1>Nuxt Layer Supabase</h1>
  </div>
</template>

<script setup>
const storage = useStorage();
onMounted(async () => {
  storage.set("supabase", "supabase");
  let test = await storage.get("supabase");
  console.log("onMounted supabase", test);
})
</script>