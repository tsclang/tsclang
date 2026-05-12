#include "runtime.h"

typedef struct { int32_t _0; bool _1; String _2; } tuple_i32_bool_string;

int main(void) {
    TSC_INIT();
    const tuple_i32_bool_string t = {._0 = 5, ._1 = true, ._2 = STR_LIT("ok")};
    printf("%d\n", t._0);
    printf("%s\n", t._1 ? "true" : "false");
    printf("%s\n", t._2.data);
    return 0;
}
