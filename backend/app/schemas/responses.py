"""
API response schemas.
"""
from typing import Generic, TypeVar, Optional
from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """Generic API response wrapper."""
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None


class SuccessResponse(BaseModel, Generic[T]):
    """Success response wrapper."""
    success: bool = True
    data: T


class ErrorResponse(BaseModel):
    """Error response wrapper."""
    success: bool = False
    error: str

