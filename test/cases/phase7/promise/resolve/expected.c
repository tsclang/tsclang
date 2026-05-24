#include "runtime.h"

typedef struct { bool _done; double _result; bool _ok; double _error; } Promise_f64;

int main(void) {
    TSC_INIT();
    Promise_f64 p = { ._done = true, ._result = 42, ._ok = true };
    return 0;
}
