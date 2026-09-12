// (c) 2026 William Li
//
// The single translation unit that compiles tinyexr's implementation. Kept apart from
// iccimage-wrapper.cpp so the wrapper includes only declarations: tinyexr is ~380 KB of
// header, and TINYEXR_IMPLEMENTATION may appear in exactly one TU.
//
// TINYEXR_USE_MINIZ=0 makes it use the zlib we already link for libpng/libtiff rather
// than bundling a second inflate. TINYEXR_USE_THREAD=0 because this WASM build has no
// pthreads — it is also tinyexr's own default, set explicitly so a future default
// change cannot quietly introduce std::thread here.
#define TINYEXR_IMPLEMENTATION
#define TINYEXR_USE_MINIZ 0
#define TINYEXR_USE_THREAD 0
#include <zlib.h>
#include "third_party/tinyexr/tinyexr.h"
