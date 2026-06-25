#include "runtime.h"

typedef struct { String _0; String *_tail; int32_t _tail_len; } Strings;

int main(void) {
    TSC_INIT();
    String _tail_0[] = {STR_LIT("second"), STR_LIT("third")};
    Strings s = {._0 = STR_LIT("first"), ._tail = _tail_0, ._tail_len = 2};
    printf("%s\n", s._0.data);
    return 0;
}
