#include "runtime.h"

typedef struct { bool _done; int32_t _result; bool _ok; } Promise_i32;

int main(void) {
    TSC_INIT();
    Promise_i32 p = { ._done = true, ._result = 42, ._ok = true };
    return 0;
}
