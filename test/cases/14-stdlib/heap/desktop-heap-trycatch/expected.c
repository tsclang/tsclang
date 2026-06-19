#include "runtime.h"
#include <stdlib.h>

typedef struct { int32_t value; } Box;
typedef struct { bool ok; union { int _dummy; TscError error; }; } Result_void_TscError;

static void Box_destructor(Box *b) {
}

Result_void_TscError make_bool(bool shouldThrow) {
    Box *_heap_0 = (Box *)tsc_malloc(sizeof(Box));
    *_heap_0 = (Box){0};
    Box *b = _heap_0;
    b->value = 42;
    if (shouldThrow) {
        if (b != NULL) { Box_destructor(b); tsc_free(b); }
        return (Result_void_TscError){.ok = false, .error = (TscError){ .message = STR_LIT("oops") }};
    }
    if (b != NULL) { Box_destructor(b); tsc_free(b); }
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
