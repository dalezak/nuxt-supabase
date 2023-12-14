<template>
  <div>
    <h1>Nuxt Layer Supabase</h1>
  </div>
</template>

<script setup>
const storage = useStorage();
onMounted(async () => {
  console.log('mounted')
  storage.set("test", "test");
  let test = await storage.get("test");
  console.log("test", test);
})
</script>