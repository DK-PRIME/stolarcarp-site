(() => {
  "use strict";

  let ready;
  window.scPublicArchive = () => {
    if (!ready) ready = fetch("/.netlify/functions/public-archive")
      .then(response => {
        if (!response.ok) throw new Error("Публічний архів тимчасово недоступний.");
        return response.json();
      })
      .then(({ documents, limited }) => {
        const entries = Object.entries(documents);
        function snapshot(path) {
          const id = path.split("/").at(-1);
          return {
            id,
            exists: Object.hasOwn(documents, path),
            data: () => Object.hasOwn(documents, path) ? documents[path] : undefined
          };
        }
        const document = path => ({
          get: async () => snapshot(path),
          collection: name => collection(path + "/" + name)
        });
        const collection = (path, filters = []) => ({
          doc: id => document(path + "/" + id),
          where: (field, operator, value) => {
            if (operator !== "==") throw new Error("Unsupported archive filter");
            return collection(path, [...filters, [field, value]]);
          },
          get: async () => {
            const prefix = path + "/";
            const docs = entries
              .filter(([key, data]) => key.startsWith(prefix) &&
                !key.slice(prefix.length).includes("/") &&
                filters.every(([field, value]) => data[field] === value))
              .map(([key]) => snapshot(key));
            return { docs, size: docs.length, empty: !docs.length, forEach: callback => docs.forEach(callback) };
          }
        });
        return { doc: document, collection, limited };
      })
      .catch(error => {
        ready = null;
        throw error;
      });
    return ready;
  };
})();
