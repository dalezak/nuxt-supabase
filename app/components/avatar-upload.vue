<template>
  <div class="avatar-upload" @click="fileInput?.click()">
    <ion-avatar>
      <img v-if="avatarSrc" :src="avatarSrc" alt="avatar" @error="onError" />
      <ion-icon v-else :icon="ioniconsPersonCircle" style="font-size: 5rem;"></ion-icon>
    </ion-avatar>
    <div class="avatar-overlay">
      <ion-spinner v-if="state.uploading" name="crescent" color="light"></ion-spinner>
      <ion-icon v-else :icon="ioniconsCameraOutline" color="light"></ion-icon>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      style="display:none"
      @change="onChange" />
  </div>
</template>

<!--
  avatar-upload — tappable circle showing the user's avatar (or a person
  icon fallback) with a hover overlay that becomes a spinner during
  upload. Wraps `useUsersStore().uploadAvatar()` + the gravatar fallback
  resolver so the parent doesn't carry the upload mechanics.

  Resolves the displayed avatar via `usersStore.avatarUrl(email, url)`
  (gravatar fallback when no uploaded URL). 404s on gravatar bounce
  to the icon fallback via the img onError handler.

  Emits `updated` (with the new URL) after a successful upload so the
  parent can keep its profile reference in sync.
-->

<script setup>
const props = defineProps({
  user: { type: Object, default: null },
});

const emit = defineEmits(['updated']);

const usersStore = useUsersStore();
const fileInput = ref(null);
const avatarSrc = ref(null);
const state = reactive({ uploading: false });

async function resolveAvatar() {
  avatarSrc.value = await usersStore.avatarUrl(props.user?.email, props.user?.avatar_url);
}

function onError() {
  avatarSrc.value = null;
}

async function onChange(event) {
  const file = event.target.files?.[0];
  if (!file || !props.user) return;
  state.uploading = true;
  try {
    const url = await usersStore.uploadAvatar(props.user, file);
    if (url) {
      avatarSrc.value = url;
      emit('updated', url);
    }
  } catch (error) {
    consoleError('avatar-upload onChange', error);
    showAlertError('Upload Failed', error);
  } finally {
    state.uploading = false;
    event.target.value = '';
  }
}

watch(() => props.user, (u) => { if (u) resolveAvatar(); }, { immediate: true });
</script>

<style scoped>
.avatar-upload {
  display: inline-block;
  position: relative;
  width: 80px;
  height: 80px;
  cursor: pointer;
}
.avatar-upload ion-avatar {
  width: 80px;
  height: 80px;
}
.avatar-overlay {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  opacity: 0;
  transition: opacity 0.2s;
}
.avatar-upload:hover .avatar-overlay,
.avatar-upload:active .avatar-overlay {
  opacity: 1;
}
</style>
