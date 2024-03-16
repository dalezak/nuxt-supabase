import { defineStore } from 'pinia';

import Users from "../models/Users";
import User from "../models/User";

export const useUsersStore = defineStore("users", {
  state: () => {
    return {
      profile: null,
      user: null,
      users: null
    }
  },
  getters: {
    getProfile(state) {
      return state.profile;
    },
    getUser(state) {
      return state.user;
    },
    getUsers(state) {
      return state.users;
    }
  },
  actions: {
    async loadProfile() {
      try {
        if (this.profile) {
          return Promise.resolve(this.profile);
        }
        else {
          let profile = await User.profile();
          if (profile) {
            await profile.store();
          }
          this.profile = profile;
          return Promise.resolve(profile);
        }
      }
      catch (error) {
        consoleError("UserStore.loadProfile", error);
        return Promise.reject(error);
      }
    },
    async loadUser({id}) {
      try {
        let user = await User.load(id);
        if (user) {
          await user.store();
        }
        this.user = user;
        return Promise.resolve(user);
      }
      catch (error) {
        consoleError("UserStore.loadUser", error);
        return Promise.reject(error);
      }
    },
    async loadUsers({limit = 10, offset = 0, search = null}) {
      try {
        let users = await Users.load(limit, offset, search);
        if (users) {
          await users.store();
        }
        if (offset > 0) {
          if (this.users == null) {
            this.users = [];
          }
          this.users = [...this.users, ...users];
        }
        else {
          this.users = users;
        }
        return Promise.resolve(users);
      }
      catch (error) {
        consoleError("UserStore.loadUsers", error);
        return Promise.reject(error);
      }
    },
    async googleSignin() {
      try {
        let user = await User.google();
        if (user) {
          user = await user.save();
          user = await user.store();
          user = await User.load(user.id);
        }
        this.profile = user;
        return Promise.resolve(user);
      }
      catch (error) {
        consoleError("UserStore.googleSignin", error);
        return Promise.reject(error);
      }
    },
    async userLogin({email, password}) {
      try {
        consoleLog("UserStore.userLogin", email, password);
        let user = await User.login(email, password);
        if (user) {
          await user.store();
        }
        this.profile = user;
        return Promise.resolve(user);
      }
      catch (error) {
        consoleError("UserStore.userLogin", error);
        return Promise.reject(error);
      }
    },
    async userSignup({name, email, password}) {
      try {
        consoleLog("UserStore.userSignup", name, email, password);
        let user = await User.signup(email, password, name);
        if (user) {
          user.name = name;
          user = await user.save();
          user = await user.store();
        }
        this.profile = user;
        return Promise.resolve(user);
      }
      catch (error) {
        consoleError("UserStore.userSignup", error);
        return Promise.reject(error);
      }
    },
    async userLogout() {
      try {
        await User.logout();
        this.profile = null;
        this.user = null;
        this.users = null;
        consoleLog("UserStore.userLogout", "done");
        return Promise.resolve();
      }
      catch (error) {
        consoleError("UserStore.userLogout", error);
        return Promise.reject(error);
      }
    },
    async resetPassword({email}) {
      try {
        await User.resetPassword(email);
        return Promise.resolve();
      }
      catch (error) {
        consoleError("UserStore.resetPassword", error);
        return Promise.reject(error);
      }
    },
    async updatePassword({password}) {
      try {
        await User.updatePassword(password);
        return Promise.resolve();
      }
      catch (error) {
        consoleError("UserStore.updatePassword", error);
        return Promise.reject(error);
      }
    }
  }
});
