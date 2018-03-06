/*
	=========================================================================
	Paperback book 3D rendering (standing position) script for Photoshop and
	Photoshop Elements

	Created by Lee Gaiteri, March 2018

	Version 1.0

	Released to the public domain.
	=========================================================================

	The following script will create a 3D image from a book cover file in
	Photoshop. It has been tested with Photoshop Elements 15 but will
	probably work with much older versions and should work with full
	Photoshop too.

	To create your book image:

	- Make a copy of this script for editing. You might want to put the copy
	  in the same folder as your cover file.

	- Open your cover file in Photoshop. This can be a front cover or
	  full wraparound cover, or front + spine. If you're not working with
	  a flat image already, flatten it.

	- Edit the script in the "Book settings" section just below to change
	  information about the book size, which parts of the cover are included
	  in the image, the angle it will be rendered at, lighting, etc.

	- Drag the script file into Photoshop and let it go.

	This script has been tested with 6"x9" books (the default) and 5"x8".
	It should work fine for other sizes too. The spine width will be
	calculated from your cover if you use a wraparound, but if not then
	you need to specify the width you want in the book dimensions.


	Why did I create this script? I wanted a nice 3D book image, but I
	couldn't find much in the way of free actions that would work with
	Elements.

	If you like this script, please stop by my blog and give me a shout.
	https://supervillainsomeday.wordpress.com
 */

/*
	Book settings: Edit these to customize the look.
 */
var book = {
	outputWidth: 3000,
	outputHeight: 2500,
	outputBorder: 100,	// edge of image where we don't draw anything (some of shadow may bleed into this a tiny bit because of Gaussian blur)

	outputDpi: 0,				// 0 to autofit to the output size, or otherwise used to give the image a consistent scale
	outputOrigin: undefined,	// set to Point3(x,y,0) to anchor the projected origin to pixel position x,y

	// Info about the book source image
	dpi: 300,
	includesSpine: true,
	includesBack: true,
	bleedPixels: 0,			// amount of bleed in the cover image; e.g. my covers for CreateSpace have 38 pixels of bleed (1/8") on every side

	// Dimensions of the book in inches
	bookWidth: 6,	// Mandatory if spine and/or back cover are included; otherwise calculated
	bookHeight: 9,	// This can be calculated from the image
	spineWidth: 1,	// Mandatory if no spine is included; otherwise calculated

	creamPages: true,		// false for white pages, true for cream
	partialOpenAngle: 2,	// pull open each cover by just a litle bit to make it look stable; each cover will be opened by half this angle

	/*
		In book scene space, the X axis is to the right, the Y axis is up,
		and Z is away from the viewer. The book's origin point is its front
		bottom spine corner.

		The book is rotated on the Y axis to place it in the scene.
	 */
	yAngle: 30,	// First rotation is on the Y axis

	/*
		Camera position info. This is just a rotation on the X axis and
		setting focal length. Technically we don't need both focalLength
		and zDistance since only the ratio of the two values matters. They're
		both here for clarity.
	 */
	xAngle: 30,			// should always be 0 or higher
	focalLength: 1.5,	// determines camera angle
	zDistance: 100,		// How far from camera book origin is

	/*
		The light source is infinitely far away (a point light would be way
		too much of a pain as far as shading is concerned).

		The ambient light factor and diffuse factors can add up to more than
		1, but the lighting will max out at 1 (no shading).

		There is no phong or specular shading here for gloss. That would be
		pretty pointless with an infinitely distant light source anyway.
	 */
	ambientLight: 0.6,	// How much ambient white light there is
	diffuseLight: 0.7,	// How much the light source impacts the result
	lightDir: Point3(10, 50, -40),	// Direction of light source; this is actually a vector, not a point, if you want to get technical

	// Dimensions in pixels; always calculated, so don't bother changing them here
	bookWidthPixels: 1800,
	bookHeightPixels: 2700,
	spineWidthPixels: 300,
	// Positions of sub-images
	spinePixelX: 0,
	frontPixelX: 0,
	pagePixelX: 0
};

var BookSide = {
	FRONT: "Front cover",
	BACK: "Back cover",
	SPINE: "Spine",
	TOP: "Pages (top)",
	SIDE: "Pages (side)"
};

/*
	=========================================================================
	Math classes
	=========================================================================

	Point3: Point or vector in 3D space; also used for 2D points
	Matrix: 4x4 matrix used for transformations
 */

function Point3(x,y,z) {
	if(!(this instanceof Point3)) return new Point3(x,y,z);
	if(typeof x === 'Object' && x.constructor == Point3) {y=x.y; z=x.z; x=x.x;}
	this.x = x;
	this.y = y;
	this.z = z;
}

// m is in column-major order
var identityMatrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function Matrix(m) {
	if(!(this instanceof Matrix)) return new Matrix(m);
	if(typeof m === 'Object' && x.constructor == Matrix) {m = m.m;}
	if(!m) m = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
	else if(typeof m === 'number') m = arguments;
	this.m = m = Array.prototype.slice.call(m);
	while(m.length < 16) m.push(identityMatrix[m.length]);
}

Point3.prototype.dot = function(p) {return this.x*p.x+this.y*p.y+this.z*p.z;};
Point3.prototype.cross = function(p) {return new Point3(this.y*p.z-this.z*p.y, this.z*p.x-this.x*p.z, this.x*p.y-this.y*p.x);};
Point3.prototype.length = function(p) {return Math.sqrt(this.dot(this));}
Point3.prototype.add = function(p) {return new Point3(this.x+p.x, this.y+p.y, this.z+p.z);}
Point3.prototype.subtract = function(p) {return new Point3(this.x-p.x, this.y-p.y, this.z-p.z);}
Point3.prototype.cross2 = function(a, b) {return a.subtract(this).cross(b.subtract(this));}
Point3.prototype.scale = function(p) {
	if(typeof p === 'number') return new Point3(this.x*p,this.y*p,this.z*p);
	return new Point3(this.x*p.x,this.y*p.y,this.z*p.z);
};
Point3.prototype.multiply = function(p) {
	if(typeof p === 'number') return this.scale(p);
	var x=this.x, y=this.y, z=this.z, m = p.m, w = m[15];
	return new Point3(
		(x*m[ 0] + y*m[ 1] + z*m[ 2] + m[ 3]) / w,
		(x*m[ 4] + y*m[ 5] + z*m[ 6] + m[ 7]) / w,
		(x*m[ 8] + y*m[ 9] + z*m[10] + m[11]) / w
	);
};
Point3.prototype.normalize = function() {var l=this.length(); if(l <= 0) return new Point3(this); return new Point3(this.x/l,this.y/l,this.z/l);}

Matrix.prototype.multiply = function(M) {
	var m = this.m, m2, result=[], i, j, k, k1, k2, n;
	if(typeof M === 'number') {
		for(i=0; i<m.length; ++i) result.push(m[i] * M);
		return new Matrix(m2);
	}
	m2 = M.m;
	for(i=0; i<4; ++i) {	// i is column
		for(j=0; j<4; ++j) {
			k1 = j; k2 = i*4;
			for(k=n=0, k1=j, k2=i*4; k<4; ++k,k1+=4,++k2)
				n += m[k1] * m2[k2];
			result.push(n);
		}
	}
	return new Matrix(result);
};

function rotationMatrix(p) {
	if(typeof p === 'number') p = Point3.apply(null,arguments);
	var angle = p.length();
	if(Math.abs(angle) < 0.0001) return new Matrix();
	p = p.scale(1/angle);	// make p a unit vector
	angle *= Math.PI / 180;
	var c=Math.cos(angle), s=Math.sin(angle), r=1-c, x=p.x, y=p.y, z=p.z, X=x*r, Y=y*r, Z=z*r;
	return new Matrix([
		// matrix is in column-major order, so this actually appears in code as if it's transposed
		//X*x+c, X*y-z*s, X*z+y*s, 0,
		//Y*x+z*s, Y*y+c, Y*z-x*s, 0,
		//Z*x-y*s, Z*y+x*s, Z*z+c, 0,
		X*x+c, X*y+z*s, X*z-y*s, 0,
		Y*x-z*s, Y*y+c, Y*z+x*s, 0,
		Z*x+y*s, Z*y-x*s, Z*z+c, 0,
		0, 0, 0, 1
	]);
}
function scaleMatrix(p) {
	if(typeof p === 'number') {p = Point3.apply(null,arguments); if(p.y == undefined) p.y = 1; if(p.z == undefined) p.z = 1;}
	return new Matrix([p.x,0,0,0, 0,p.y,0,0, 0,0,p.z,0, 0,0,0,1]);
}
function translationMatrix(p) {
	if(typeof p === 'number') p = Point3.apply(null,arguments);
	return new Matrix([1,0,0,p.x, 0,1,0,p.y, 0,0,1,p.z, 0,0,0,1]);
}


/*
	=========================================================================
	High-level rendering
	=========================================================================
 */

/*
	The main workhorse function. This is called at the end of the file.
 */
function drawBook() {
	var a, p, i, renderOrder = [];

	loadBook();		// read width and height data
	projectBook();	// calculate the projection matrix and transforms for points

	createPages();	// create the image that will be used for pages
	createResult();	// create the output image

	// Which faces will we see?
	a = book.yAngle;	// this has already been normalized to -180 to 180
	p = book.partialOpenAngle / 2;
	if(a < -90-p)
		renderOrder = [BookSide.SIDE, BookSide.TOP, BookSide.BACK];
	else if(a <= -90+p)
		renderOrder = [BookSide.SIDE, BookSide.TOP];
	else if(a < 0)
		renderOrder = [BookSide.SIDE, BookSide.TOP, BookSide.FRONT];
	else if(!a)
		renderOrder = [BookSide.TOP, BookSide.FRONT];
	else if(a < 90-p)
		renderOrder = [BookSide.TOP, BookSide.SPINE, BookSide.FRONT];
	else if(a < 90+p)
		renderOrder = [BookSide.TOP, BookSide.SPINE, BookSide.BACK, BookSide.FRONT];
	else if(a <= 180-p)
		renderOrder = [BookSide.TOP, BookSide.SPINE, BookSide.BACK];
	else
		renderOrder = [BookSide.SIDE, BookSide.TOP, BookSide.SPINE, BookSide.BACK];
	// render the visible faces in order
	for(i=0; i<renderOrder.length; ++i) renderSide(renderOrder[i]);

	closeDocument(1);	// close the image used for pages; we don't need it anymore
	renderShadow();		// render the shadow layer

	// render a background layer
	newSolidLayer(128,128,128);
	app.activeDocument.activeLayer.move(app.activeDocument, ElementPlacement.PLACEATEND);
}

/*
	Load the book image into a file so we can use it
 */
function loadBook() {
	var width, height;

	// Do we have to change the ruler units? I have no idea, but let's be safe
	var saveUnits = app.preferences.rulerUnits;
	app.preferences.rulerUnits = Units.PIXELS;

	width = pxToNumber(app.activeDocument.width);
	height = pxToNumber(app.activeDocument.height);

	app.preferences.rulerUnits = saveUnits;

	// Trim off bleed
	height -= book.bleedPixels * 2;
	width -= book.bleedPixels * (book.includesBack ? 2 : 1);

	book.bookHeightPixels = height;
	book.bookHeight = height / book.dpi;

	if(book.includesBack) {	// spine is always included if back is included
		book.bookWidthPixels = book.bookWidth * book.dpi;
		book.spineWidthPixels = width - book.bookWidthPixels*2;
		book.spineWidth = book.spineWidthPixels / book.dpi;
		book.spinePixelX = book.bleedPixels + book.bookWidthPixels;
		book.frontPixelX = book.spinePixelX + book.spineWidthPixels;
	}
	else if(book.includesSpine) {
		book.bookWidthPixels = book.bookWidth * book.dpi;
		book.spineWidthPixels = width - book.bookWidthPixels;
		book.spineWidth = book.spineWidthPixels / book.dpi;
		book.spinePixelX = book.bleedPixels;
		book.frontPixelX = book.spinePixelX + book.spineWidthPixels;
	}
	else {
		book.bookWidthPixels = width;
		book.bookWidth = width / book.dpi;
		book.spineWidthPixels = book.spineWidth * dpi;
		book.spinePixelX = book.frontPixelX = book.bleedPixels;
	}
	book.pagePixelX = width;
}

/*
	Draw a book pages texture
 */
function createPages() {
	var desc;
	newDocument(book.spineWidthPixels,Math.min(book.bookWidthPixels,book.bookHeightPixels));

	// Fibers, low variation and max length
	app.foregroundColor = book.creamPages ? rgbColor(187, 180, 166) : rgbColor(200, 200, 200),
	app.backgroundColor = book.creamPages ? rgbColor(255, 245, 227) : rgbColor(255, 255, 255),
	desc = new ActionDescriptor();
	desc.putInteger(charIDToTypeID("Vrnc"), 9);
	desc.putInteger(charIDToTypeID("Strg"), 64 );
	desc.putInteger(charIDToTypeID("RndS"), 48102939);	// we don't really need this, but for consistency...
	executeAction(charIDToTypeID("Fbrs"), desc, DialogModes.NO );

	// Motion blur
	desc = new ActionDescriptor();
	desc.putInteger(charIDToTypeID("Angl"), 90);
	desc.putUnitDouble(charIDToTypeID("Dstn"), charIDToTypeID("#Pxl"), 1000);
	executeAction(charIDToTypeID("MtnB"), desc, DialogModes.NO );
}

/*
	Create the document for the final image
 */
function createResult() {
	newDocument(book.outputWidth, book.outputHeight);
}

/*
	Calculate the XYZ position of the book in scene space and then the camera
	projection.
 */
function projectBook() {
	var xyz = [], xy = [], z, f, i;
	var minx, maxx, miny, maxy;
	var origin, scale, minp, maxp;
	var w=book.bookWidth, h=book.bookHeight, d=book.spineWidth;
	var dir = book.lightDir;

	// These matrices use Cartesian coordinates
	var frontOpen = rotationMatrix(0,-book.partialOpenAngle/2,0);
	var backOpen = rotationMatrix(0,book.partialOpenAngle/2,0).multiply(translationMatrix(0,0,d));
	var bookTurn = rotationMatrix(0,book.yAngle,0);
	var projection = rotationMatrix(book.xAngle, 0, 0);

	book.yAngle -= 360 * Math.floor(book.yAngle / 360);
	if(book.yAngle > 180) book.yAngle -= 360;
	book.xAngle -= 360 * Math.floor(book.xAngle / 360);
	if(book.xAngle > 180) book.xAngle -= 360;

	// At this point all these coordinates are all still Cartesian
	xyz[0] = Point3(0,0,0);
	xyz[1] = Point3(w,0,0).multiply(frontOpen);
	xyz[2] = Point3(0,h,0);
	xyz[3] = Point3(w,h,0).multiply(frontOpen);
	xyz[4] = Point3(0,0,d);
	xyz[5] = Point3(w,0,0).multiply(backOpen);
	xyz[6] = Point3(0,h,d);
	xyz[7] = Point3(w,h,0).multiply(backOpen);

	// Turn book into position
	for(i=0; i<8; ++i) {
		xyz[i] = xyz[i].multiply(bookTurn);
	}

	// Cast shadows
	for(i=0; i<8; ++i) {
		if(dir.y) xyz[i+8] = xyz[i].subtract(dir.scale(xyz[i].y / dir.y));
		else (xyz[i+8] = new Point3(xyz[i])).y = 0;
		//alert(xyz[i+8].x+", "+xyz[i+8].y+", "+xyz[i+8].z);
	}

	// Do camera projection
	for(i=0; i<xyz.length; ++i) {
		xyz[i] = xyz[i].multiply(projection);
	}

	// Convert camera projection coords to 2D by multiplying x,y by f/(f+z)
	// Also we need to change to the coordinate system Photoshop uses.
	f = book.zDistance / book.focalLength;
	for(i=0; i<xyz.length; ++i) {
		z = xyz[i].z;
		z = f / (f+z);
		xy.push(xyz[i].multiply(z));
		// Flip Y axis to convert from Cartesian to PS coords
		xy[i].y = -xy[i].y;

		if(!i) {minx=maxx=xy[i].x; miny=maxy=xy[i].y; continue;}
		if(xy[i].x < minx) minx = xy[i].x;
		else if(xy[i].x > maxx) maxx = xy[i].x;
		if(xy[i].y < miny) miny = xy[i].y;
		else if(xy[i].y > maxy) maxy = xy[i].y;
	}

	scale = book.outputDpi || Math.min((book.outputWidth-book.outputBorder)/(maxx-minx), (book.outputHeight-book.outputBorder)/(maxy-miny));

	for(i=0; i<xyz.length; ++i) {
		if(book.outputOrigin) {
			xy[i] = xy[i].multiply(scale).add(book.outputOrigin);
		}
		else {
			xy[i].x = (xy[i].x - minx - (maxx-minx)/2) * scale + book.outputWidth / 2;
			xy[i].y = (xy[i].y - miny - (maxy-miny)/2) * scale + book.outputHeight / 2;
		}

		// use exact coordinates to avoid seams
		xy[i].x = Math.floor(xy[i].x+0.5);
		xy[i].y = Math.floor(xy[i].y+0.5);
	}

	book.points3D = xyz;
	book.points2D = xy;

	book.normals = i = {};	
	i[BookSide.FRONT] = xyz[0].cross2(xyz[2],xyz[1]);
	i[BookSide.BACK] = xyz[4].cross2(xyz[5],xyz[6]);
	i[BookSide.SPINE] = xyz[0].cross2(xyz[4],xyz[2]);
	i[BookSide.TOP] = xyz[2].cross2(xyz[6],xyz[3]);
	i[BookSide.SIDE] = xyz[1].cross2(xyz[3],xyz[5]);
}

/*
	Render one visible side of the book, including its shading.
 */
function renderSide(side) {
	var x, y, i, coords = [], shadow = [];
	switch(side) {
		case BookSide.FRONT:
			selectDocument(0);
			x = book.frontPixelX; y = book.bleedPixels;
			selectRect(x,y,x+book.bookWidthPixels,y+book.bookHeightPixels);
			coords = [2,3,1,0];
			break;
		case BookSide.BACK:
			selectDocument(0);
			x = y = book.bleedPixels;
			selectRect(x,y,x+book.bookWidthPixels,y+book.bookHeightPixels);
			coords = [7,6,4,5];
			break;
		case BookSide.SPINE:
			selectDocument(0);
			x = book.spinePixelX; y = book.bleedPixels;
			selectRect(x,y,x+book.spineWidthPixels,y+book.bookHeightPixels);
			coords = [6,2,0,4];
			break;
		case BookSide.SIDE:
			selectDocument(1);
			app.activeDocument.selection.selectAll();
			coords = [7,3,1,5];	// this one is counterclockwise, so the texture will be flipped (so it lines up with TOP)
			break;
		case BookSide.TOP:
			selectDocument(1);
			app.activeDocument.selection.selectAll();
			coords = [7,3,2,6];
			break;
	}
	for(i=0; i<4; ++i) {
		shadow[i] = book.points2D[coords[i]+8];
		coords[i] = book.points2D[coords[i]];
	}

	app.activeDocument.selection.copy();
	app.activeDocument.selection.deselect();
	selectDocument(2);

	// First we'll render this face, but with nearest-neighbor sampling to minimize seams
	app.activeDocument.paste(false);	// don't paste into selection; create a new layer
	transformActiveLayer(coords, true);

	// Second render pass: use bicubic sampling
	app.activeDocument.paste(false);	// don't paste into selection; create a new layer
	transformActiveLayer(coords);
	mergeDown();

	// Calculate how much to darken this face if at all.
	var lighting;
	var dir = book.lightDir.normalize();
	lighting = Math.max(0, dir.dot(book.normals[side].normalize()));
	lighting = Math.min(1, book.ambientLight + book.diffuseLight * lighting);
	lighting = Math.floor(lighting*255 + 0.5);	// convert to 0-255

	if(lighting < 255) {
		newAdjustmentLayer();
		changeLevelsInOut(0, lighting);	// change output levels
		mergeDown();
	}

	// Name the layer
	app.activeDocument.activeLayer.name = side;
}

/*
	Render the shadow layer.
 */
function renderShadow() {
	var i, j, count, bit, mask;
	var corners = [];

	selectDocument(1);

	// Create a black layer just so we can sample it, then delete the layer.
	newSolidLayer(0,0,0);
	app.activeDocument.selection.selectAll();
	app.activeDocument.selection.copy();
	app.activeDocument.activeLayer.remove();

	/*
		Get each face of the book and draw its shadow projection.
		The corner coordinates are 0-7, and add 8 for shadow coords.

		Because corner #s are arranged bitwise (bit 0=x, 1=y, 2=z), the outer
		face is bit 0 on, spine is bit 0 off, top is bit 1 on, etc. Go through
		each of those "face bit" cases. To get the corners in the right order,
		we count 0-7 and skip over ones where the face bit doesn't match.

		Then, the 3rd and 4th corners have to be swapped so they're in cw or
		ccw order.
	 */
	for(bit=4,mask=count=0; bit; bit=mask?bit:(bit>>1),mask=~mask) {
		for(i=j=0; i<8; ++i) {
			if((i ^ mask) & bit) corners[j++] = book.points2D[i+8];
		}
		// swap last two corners to put them in the right order
		i = corners[2]; corners[2] = corners[3]; corners[3] = i;
		app.activeDocument.paste(false);	// paste into a new layer
		transformActiveLayer(corners, true);	// use nearest-neighbor sampling to minimize seams
		if(count++) mergeDown();	// if not the first shadow layer, merge it down
	}

	// get rid of single-pixel artifacts between seams
	app.activeDocument.activeLayer.applyMinimum(1);
	app.activeDocument.activeLayer.applyMaximum(1);
	//
	app.activeDocument.activeLayer.applyGaussianBlur(20);
	app.activeDocument.activeLayer.opacity = (1-book.ambientLight) * 50;

	app.activeDocument.activeLayer.name = "Shadow";
	app.activeDocument.activeLayer.move(app.activeDocument, ElementPlacement.PLACEATEND);
}



/*
	=========================================================================
	Low-level rendering helper functions
	=========================================================================
 */


var currentDocument = 0;
function selectDocument(n) {
	if(n == currentDocument) return;
	var desc = new ActionDescriptor();
	var ref = new ActionReference();
	ref.putOffset(charIDToTypeID("Dcmn"), n-currentDocument);
	desc.putReference(charIDToTypeID("null"), ref);
	//desc.putInteger(charIDToTypeID("DocI"), 153);
	executeAction(charIDToTypeID("slct"), desc, DialogModes.NO );
	currentDocument = n;
}

function closeDocument(n) {
	selectDocument(n);
	app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
}

function newDocument(w,h) {
	var rlt = charIDToTypeID("#Rlt");
	var desc = new ActionDescriptor();
	var desc2 = new ActionDescriptor();
	desc2.putClass(charIDToTypeID("Md  "), charIDToTypeID("RGBM"));
	desc2.putUnitDouble(charIDToTypeID("Wdth"), rlt, w*0.24);
	desc2.putUnitDouble(charIDToTypeID("Hght"), rlt, h*0.24);
	desc2.putUnitDouble(charIDToTypeID("Rslt"), charIDToTypeID("#Rsl"), 300);
	desc2.putDouble(stringIDToTypeID("pixelScaleFactor"), 1);
	desc2.putEnumerated(charIDToTypeID("Fl  "), charIDToTypeID("Fl  "), charIDToTypeID("Trns"));
	desc2.putInteger(charIDToTypeID("Dpth"), 8);
	desc2.putString(stringIDToTypeID("profile"), "sRGB IEC61966-2.1");
	desc.putObject(charIDToTypeID("Nw  "), charIDToTypeID("Dcmn"), desc2);
	//desc.putInteger(charIDToTypeID("DocI"), 153);
	executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);
	++currentDocument;
}

function rgbColor(r,g,b) {
	var color = new SolidColor();
	color.rgb.red = r;
	color.rgb.green = g;
	color.rgb.blue = b;
	return color;
}

/*
	This function is actually a prettied-up version of a script from Adobe,
	but with minor changes.

	See StackSupport.jsx for the original.
 */
function transformActiveLayer(newCorners, nearest) {
	var saveUnits = app.preferences.rulerUnits;
	var unitPixels = charIDToTypeID("#Pxl");
	app.preferences.rulerUnits = Units.PIXELS;
	var i;
	var setArgs = new ActionDescriptor();
	var chanArg = new ActionReference();
	chanArg.putProperty(charIDToTypeID('Chnl'), charIDToTypeID('fsel'));
	var boundsDesc = new ActionDescriptor();
	var layerBounds = app.activeDocument.activeLayer.bounds;
	boundsDesc.putUnitDouble(charIDToTypeID("Left"), unitPixels, pxToNumber(layerBounds[0]));
	boundsDesc.putUnitDouble(charIDToTypeID("Top "), unitPixels, pxToNumber(layerBounds[1]));
	boundsDesc.putUnitDouble(charIDToTypeID("Rght"), unitPixels, pxToNumber(layerBounds[2]));
	boundsDesc.putUnitDouble(charIDToTypeID("Btom"), unitPixels, pxToNumber(layerBounds[3]));
	var result = new ActionDescriptor();
	var args = new ActionDescriptor();
	var quadRect = new ActionList();
	quadRect.putUnitDouble(unitPixels, pxToNumber(layerBounds[0]));
	quadRect.putUnitDouble(unitPixels, pxToNumber(layerBounds[1]));
	quadRect.putUnitDouble(unitPixels, pxToNumber(layerBounds[2]));
	quadRect.putUnitDouble(unitPixels, pxToNumber(layerBounds[3])); 
	var quadCorners = new ActionList();
	for(i = 0; i < 4; ++i) {
		quadCorners.putUnitDouble(unitPixels, newCorners[i].x);
		quadCorners.putUnitDouble(unitPixels, newCorners[i].y);
	}
	args.putList(stringIDToTypeID("rectangle"), quadRect);
	args.putList(stringIDToTypeID("quadrilateral"), quadCorners);
	// Choose interpolation method
	args.putEnumerated(charIDToTypeID("Intr"), charIDToTypeID("Intp"), charIDToTypeID(nearest ? "Nrst" : "Bcbc"));
	executeAction(charIDToTypeID("Trnf"), args); 
	// I pulled out the deselect since it isn't used for anything.
	app.preferences.rulerUnits = saveUnits;
}

// Okay, this was Adobe's too.
function pxToNumber(px) {return px.as("px");}

function xyDesc(x,y) {
	var desc = new ActionDescriptor();
	var pxl = charIDToTypeID("#Pxl")
	desc.putUnitDouble(charIDToTypeID("Hrzn"), pxl, x);
	desc.putUnitDouble(charIDToTypeID("Vrtc"), pxl, y);
	return desc;
}

function rectDesc(l,t,r,b) {
	var desc = new ActionDescriptor();
	var pxl = charIDToTypeID("#Pxl");
	desc.putUnitDouble(charIDToTypeID("Left"), pxl, l);
	desc.putUnitDouble(charIDToTypeID("Top "), pxl, t);
	desc.putUnitDouble(charIDToTypeID("Rght"), pxl, r);
	desc.putUnitDouble(charIDToTypeID("Btom"), pxl, b);
	return desc;
}

function selectRect(l,t,r,b) {
	var desc = new ActionDescriptor();
	var ref = new ActionReference();
	ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
	desc.putReference(charIDToTypeID("null"), ref);
	desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Rctn"), rectDesc(l,t,r,b));
	executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
}

function mergeDown() {
	executeAction(charIDToTypeID("Mrg2"), new ActionDescriptor(), DialogModes.NO);
}

function newAdjustmentLayer(group) {
	var desc = new ActionDescriptor();
	var ref = new ActionReference();
	ref.putClass(charIDToTypeID("AdjL"));
	desc.putReference(charIDToTypeID("null"), ref);
	var desc2 = new ActionDescriptor();
	if(group) desc2.putBoolean(charIDToTypeID("Grup"), true);
	desc2.putClass(charIDToTypeID("Type"), charIDToTypeID("Lvls"));
	desc.putObject(charIDToTypeID("Usng"), charIDToTypeID("AdjL"), desc2);
	executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);
}

function int2ToList(a,b) {
	var list = new ActionList();
	list.putInteger(a);
	list.putInteger(b);
	return list;
}

function changeLevelsInOut(min,max,channel,isInput) {
	var chnl = charIDToTypeID("Chnl");
	var channelId;
	switch(channel) {
		case "red": channelId = charIDToTypeID("Rd  "); break;
		case "green": channelId = charIDToTypeID("Grn "); break;
		case "blue": channelId = charIDToTypeID("Bl  "); break;
		case "alpha": channelId = stringIDToTypeID("alpha"); break;
		default: channelId = charIDToTypeID("Cmps"); break;
	}

	var desc = new ActionDescriptor();
	var ref = new ActionReference();
	ref.putEnumerated(charIDToTypeID("AdjL"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
	desc.putReference(charIDToTypeID("null"), ref);

	var desc2 = new ActionDescriptor();
	var list = new ActionList();

	var desc3 = new ActionDescriptor();
	ref = new ActionReference();
	ref.putEnumerated(chnl, chnl, channelId);
	desc3.putReference(chnl, ref);
	desc3.putList(charIDToTypeID(isInput ? "Inpt" : "Otpt"), int2ToList(min,max));

	list.putObject(charIDToTypeID("LvlA"), desc3);
	desc2.putList(charIDToTypeID("Adjs"), list);
	desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Lvls"), desc2);

	executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
}

// Sure there are other ways to make a solid layer besides doing a flood fill, but dang if it isn't easier this way.
function newSolidLayer(r,g,b) {
	app.activeDocument.artLayers.add();
	app.activeDocument.selection.selectAll();
	app.foregroundColor = rgbColor(r,g,b);
	floodFill(0,0);
}

function floodFill(x,y) {
    var desc = new ActionDescriptor();
    desc.putObject(charIDToTypeID("From"), charIDToTypeID("Pnt "), xyDesc(x,y));
    desc.putInteger(charIDToTypeID("Tlrn"), 0);
    desc.putBoolean(charIDToTypeID("AntA"), false);
    desc.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("FlCn"), charIDToTypeID("FrgC"));
	executeAction(charIDToTypeID("Fl  "), desc, DialogModes.NO);
}



// Now everything's set up, so call drawBook() to get this party started.
drawBook();
