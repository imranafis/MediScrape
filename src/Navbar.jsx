import { Link } from "react-router-dom";
function Navbar() {
  return (
    <nav>
      <Link to="/Landing">Landing</Link>
      <Link to="/history" >History</Link>
      <Link to="/analysis" >Analysis</Link>
    </nav>
  );
}

export default Navbar;
