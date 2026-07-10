// Async-loaded framer-motion feature bundle for the public site's LazyMotion.
// domMax (not domAnimation) because Navbar and RoomsCatalog use layoutId
// shared-layout transitions. Loaded as a separate chunk AFTER hydration, so
// the motion runtime stays off the critical path (FCP/INP).
export { domMax as default } from "framer-motion";
