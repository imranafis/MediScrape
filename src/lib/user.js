export const setUser = (name, uid) => {
    localStorage.setItem("userName", name);
    localStorage.setItem("userID", uid);
  };
  
  export const getUser = () => {
    return {
      name: localStorage.getItem("userName"),
      uid: localStorage.getItem("userID"),
    };
  };
  
  export const clearUser = () => {
    localStorage.removeItem("userName");
    localStorage.removeItem("userID");
  };
  