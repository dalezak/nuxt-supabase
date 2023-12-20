<template>
  <div>
    <h1>Nuxt Layer Supabase</h1>
  </div>
</template>

<script setup>
onMounted(async () => {
  console.log("onMounted supabase", process.client ? "client" : "server");
})
</script>