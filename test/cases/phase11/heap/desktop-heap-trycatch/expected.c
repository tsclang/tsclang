#include "runtime.h"
#include <stdlib.h>

typedef struct { int32_t value; } Box;

Result_void_TscError make_bool(bool shouldThrow) {
    Box *_heap_0 = (Box *)tsc_malloc(sizeof(Box));
    *_heap_0 = Box_new();
    Box *b = _heap_0;
    b->value = 42;
    if (shouldThrow) {
        return (Result_void_TscError){.ok = false, .error = Error_new(STR_LIT("oops"))};
    }
    return (Result_void_TscError){.ok = true};
}

int32_t _tsc_main(void) {
    Result_void_TscError _res_1 = make_bool(true);
    if (!_res_1.ok) {
        (void)_res_1.error;
        return 1;
    }
    return 0;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", _tsc_main());
    return _tsc_main();
}
